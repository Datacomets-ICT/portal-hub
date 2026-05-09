// Web Worker: encode 16-bit PCM mono samples → MP3 in a background
// thread so the main thread (and the user's UI) stays responsive.
// Target bitrate is 32 kbps mono — voice-grade, plenty for Whisper to
// transcribe accurately, ~10× smaller than the typical Zoom export.

import { Mp3Encoder } from '@breezystack/lamejs';

const FRAME = 1152;        // MP3 frame size (lamejs requirement)
// 48 kbps mono is the sweet spot — small enough that 2 hr fits the
// 25 MB Groq Whisper request limit (≈ 43 MB at 48 k... close, may
// need to chunk for longer), but high enough that Thai voice with
// background noise transcribes cleanly. 32 kbps was producing
// hallucinations like "ค่ะ ค่ะ ค่ะ" loops on long meetings.
const BITRATE_KBPS = 48;

self.onmessage = (e) => {
  const { samplesBuffer, sampleRate } = e.data || {};
  if (!samplesBuffer) {
    self.postMessage({ error: 'No samples received' });
    return;
  }
  try {
    const float = new Float32Array(samplesBuffer);
    // Float32 [-1, 1]  →  Int16 [-32768, 32767]
    const pcm = new Int16Array(float.length);
    for (let i = 0; i < float.length; i++) {
      const s = Math.max(-1, Math.min(1, float[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    const encoder = new Mp3Encoder(1, sampleRate, BITRATE_KBPS);
    const chunks = [];
    let totalBytes = 0;

    // Periodic progress report (every ~5%) — main thread re-maps it
    // into the upload progress bar so the user just sees one smooth
    // bar moving and doesn't realise we're encoding.
    let lastReport = 0;
    const progressEvery = Math.max(1, Math.floor(pcm.length / 20));

    for (let i = 0; i < pcm.length; i += FRAME) {
      const sliceEnd = Math.min(i + FRAME, pcm.length);
      const enc = encoder.encodeBuffer(pcm.subarray(i, sliceEnd));
      if (enc.length > 0) {
        chunks.push(new Uint8Array(enc));
        totalBytes += enc.length;
      }
      if (i - lastReport >= progressEvery) {
        lastReport = i;
        self.postMessage({ progress: i / pcm.length });
      }
    }
    const final = encoder.flush();
    if (final.length > 0) {
      chunks.push(new Uint8Array(final));
      totalBytes += final.length;
    }

    // Build a single Uint8Array we can transfer back zero-copy
    const out = new Uint8Array(totalBytes);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    self.postMessage(
      { done: true, mp3: out.buffer, byteLength: out.byteLength },
      [out.buffer]
    );
  } catch (err) {
    self.postMessage({ error: String(err?.message || err) });
  }
};
