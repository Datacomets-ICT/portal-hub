// Speech-to-text for audio attachments, using a local whisper.cpp build.
//
// Why local: matches the rest of this worker's "everything on the office
// machine, nothing leaves the network" design (same reason we call a local
// Ollama instead of a cloud LLM). No API key, no per-minute cost.
//
// Flow:
//   1. write the raw audio buffer to a temp file
//   2. ffmpeg → 16 kHz mono 16-bit WAV  (the ONLY format whisper.cpp eats)
//   3. whisper-cli.exe -m <model> -l th -otxt  → reads back the .txt
//   4. clean up all temp files in a finally block
//
// Everything is async-spawned (never spawnSync) so a multi-minute transcription
// doesn't block the worker's poll loop / Supabase realtime heartbeats.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir, cpus } from 'node:os';
import {
  writeFile, readFile, unlink, access,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));

// --- config (env-overridable, sensible defaults relative to this worker) ----
// Prefer the CUDA (GPU) build when it's installed — on an NVIDIA GPU it's
// ~10-20x faster than the CPU build. Falls back to the CPU build automatically.
const CUDA_CLI = join(HERE, 'stt', 'cuda', 'Release', 'whisper-cli.exe');
const CPU_CLI  = join(HERE, 'stt', 'Release', 'whisper-cli.exe');
const WHISPER_CLI    = process.env.WHISPER_CLI    || (existsSync(CUDA_CLI) ? CUDA_CLI : CPU_CLI);
const WHISPER_MODEL  = process.env.WHISPER_MODEL  || join(HERE, 'stt', 'ggml-large-v3-turbo-q5_0.bin');
const FFMPEG_PATH    = process.env.FFMPEG_PATH    || 'ffmpeg';
const WHISPER_LANG   = process.env.WHISPER_LANG   || 'th';
// Voice Activity Detection model. If present, whisper transcribes ONLY detected
// speech segments — this is what stops the model hallucinating "oh oh oh…" /
// looping garbage over music & silence (very common in real recordings). The
// silero VAD model is tiny (~0.9 MB). Optional: if the file is missing we just
// skip the VAD flags and rely on the anti-hallucination thresholds below.
const WHISPER_VAD_MODEL = process.env.WHISPER_VAD_MODEL || join(HERE, 'stt', 'ggml-silero-v5.1.2.bin');
// Leave a couple cores for Ollama + the OS. whisper.cpp is CPU-bound here.
const WHISPER_THREADS = Number(process.env.WHISPER_THREADS) || Math.max(2, cpuCount() - 2);
// Whole-file ceiling. On CPU transcription runs around real-time speed, so a
// long recording (a 1.5h meeting is normal) legitimately needs a high ceiling.
// 3h covers ~2h of audio with margin; bump STT_TIMEOUT_MS in .env if needed.
const STT_TIMEOUT_MS = Number(process.env.STT_TIMEOUT_MS) || 10_800_000; // 3h

function cpuCount() {
  try { return cpus().length || 4; } catch { return 4; }
}

// Audio (and audio-bearing video) extensions / mime types we transcribe.
const AUDIO_EXTS = new Set([
  'mp3', 'wav', 'wave', 'm4a', 'aac', 'ogg', 'oga', 'opus',
  'flac', 'wma', 'amr', '3gp', 'webm', 'mp4', 'm4b', 'mkv', 'mov',
]);

export function isAudioAttachment(fileName = '', mime = '') {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const m = (mime || '').toLowerCase();
  return AUDIO_EXTS.has(ext) || m.startsWith('audio/') || m.startsWith('video/');
}

// Spawn a command, capture stdout/stderr, reject on non-zero / timeout.
// onStderr (optional) gets each stderr chunk live — used to surface whisper's
// progress on long files.
function run(cmd, args, { timeoutMs, onStderr } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timer = null;
    if (timeoutMs) {
      timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { const s = d.toString(); stderr += s; if (onStderr) onStderr(s); });
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(new Error(`${cmd} spawn failed: ${err.message}`));
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-400)}`));
    });
  });
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

/**
 * Transcribe an audio buffer to plain text. Returns '' on any failure
 * (caller treats that as "couldn't read the file" — same as a broken PDF).
 *
 * @param {Buffer} buf      raw bytes of the uploaded audio file
 * @param {string} fileName original name, used only for the temp extension
 * @param {(msg:string)=>void} [log]
 */
export async function transcribeAudio(buf, fileName = 'audio', log = () => {}) {
  // Fail fast with a clear message if the toolchain isn't installed, rather
  // than spawning and getting a cryptic ENOENT.
  if (!(await exists(WHISPER_CLI))) {
    throw new Error(`whisper-cli not found at ${WHISPER_CLI} (set WHISPER_CLI in .env)`);
  }
  if (!(await exists(WHISPER_MODEL))) {
    throw new Error(`whisper model not found at ${WHISPER_MODEL} (set WHISPER_MODEL in .env)`);
  }

  const ext = (fileName.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const stamp = `${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const inPath  = join(tmpdir(), `stt_${stamp}.${ext}`);
  const wavPath = join(tmpdir(), `stt_${stamp}.wav`);
  const outBase = join(tmpdir(), `stt_${stamp}_out`); // whisper appends .txt
  const txtPath = `${outBase}.txt`;

  try {
    await writeFile(inPath, buf);

    // 1. Decode to whisper's required 16 kHz mono 16-bit PCM WAV.
    log(`ffmpeg decode → 16kHz wav`);
    await run(FFMPEG_PATH, [
      '-y', '-i', inPath,
      '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
      wavPath,
    ], { timeoutMs: 300_000 });

    // 2. Transcribe. -otxt writes "<outBase>.txt"; -nt keeps it clean.
    const useVad = await exists(WHISPER_VAD_MODEL);
    const args = [
      '-m', WHISPER_MODEL,
      '-f', wavPath,
      '-l', WHISPER_LANG,
      '-t', String(WHISPER_THREADS),
      // --- speed: greedy decoding instead of beam search (~2x faster on CPU,
      //     negligible quality loss for summarization-grade transcripts) ---
      '-bs', '1',    // beam size 1
      '-bo', '1',    // best-of 1
      // --- anti-hallucination on non-speech / silence ---
      '-sns',        // suppress non-speech tokens (music notes, [sound], …)
      '-mc', '0',    // no text-context carryover → breaks repetition loops
      '-nf',         // no temperature fallback (fallback amplifies hallucination)
      '-pp',         // print progress → streamed to the log for long files
      '-nt',
      '-otxt',
      '-of', outBase,
    ];
    if (useVad) {
      args.push('--vad', '--vad-model', WHISPER_VAD_MODEL);
    }
    const gpu = WHISPER_CLI.toLowerCase().includes('cuda');
    log(`whisper-cli transcribe (lang=${WHISPER_LANG}, threads=${WHISPER_THREADS}, vad=${useVad}, gpu=${gpu})`);
    // Surface progress every ~20% so a long (1h+) transcription doesn't look hung.
    let nextPct = 20;
    await run(WHISPER_CLI, args, {
      timeoutMs: STT_TIMEOUT_MS,
      onStderr: (s) => {
        const m = s.match(/progress\s*=\s*(\d+)%/);
        if (m && Number(m[1]) >= nextPct) {
          log(`transcribe progress ~${Number(m[1])}%`);
          nextPct = Math.floor(Number(m[1]) / 20) * 20 + 20;
        }
      },
    });

    const text = (await readFile(txtPath, 'utf8')).trim();
    log(`transcript: ${text.length} chars`);
    return text;
  } finally {
    // Best-effort cleanup — never let a leftover temp file fail the job.
    for (const p of [inPath, wavPath, txtPath]) {
      await unlink(p).catch(() => {});
    }
  }
}
