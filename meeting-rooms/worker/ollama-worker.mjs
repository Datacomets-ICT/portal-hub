#!/usr/bin/env node
// Ollama summary worker daemon.
//
// Polls mtg_summary_jobs for queued rows, runs each one through the
// summarization pipeline, writes the result to mtg_bookings.auto_summary,
// and flips the job to 'done' (or 'error').
//
// Run with `node ollama-worker.mjs` (loops forever) or with --once for
// a single iteration (useful for ad-hoc retries / testing).

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { extractAttachmentText, capFileText, summarize } from './pipeline.mjs';

// ---------------------------------------------------------------------------
// Env validation — fail loud rather than silently looping with no work.
// ---------------------------------------------------------------------------
const SUPABASE_URL          = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const OLLAMA_BASE_URL       = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL          = process.env.OLLAMA_MODEL || 'qwen2.5:14b';
const WORKER_POLL_MS        = Number(process.env.WORKER_POLL_MS || 10_000);
const OLLAMA_TIMEOUT_MS     = Number(process.env.OLLAMA_TIMEOUT_MS || 240_000);

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
  process.exit(1);
}

const RUN_ONCE = process.argv.includes('--once');

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
function log(...args) {
  console.log(`[${ts()}]`, ...args);
}
function logErr(...args) {
  console.error(`[${ts()}] ERROR`, ...args);
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------
async function claimNextJob() {
  const { data, error } = await sb.rpc('mtg_claim_next_summary_job');
  if (error) throw error;
  if (!data || !data.length) return null;
  return data[0];   // { job_id, booking_id }
}

async function finishJob(jobId, success, errMsg) {
  const { error } = await sb.rpc('mtg_finish_summary_job', {
    p_job_id:  jobId,
    p_success: success,
    p_error:   errMsg || null,
  });
  if (error) throw error;
}

async function fetchSummaryInputs(bookingId) {
  const { data, error } = await sb.rpc('mtg_summary_inputs', {
    p_booking_id: bookingId,
  });
  if (error) throw error;
  return data;
}

async function saveSummary(bookingId, summary) {
  const { error } = await sb.rpc('mtg_save_auto_summary', {
    p_booking_id: bookingId,
    p_summary:    summary,
  });
  if (error) throw error;
}

async function listAttachments(bookingId) {
  const { data, error } = await sb
    .from('mtg_attachments')
    .select('*')
    .eq('booking_id', bookingId);
  if (error) {
    logErr('listAttachments:', error.message);
    return [];
  }
  return data || [];
}

async function downloadAttachment(storagePath) {
  const { data, error } = await sb.storage
    .from('meeting-files')
    .download(storagePath);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

async function collectAttachmentTexts(bookingId) {
  const atts = await listAttachments(bookingId);
  if (!atts.length) return [];
  const results = [];
  for (const a of atts) {
    try {
      const buf = await downloadAttachment(a.storage_path);
      const raw = await extractAttachmentText(a, buf);
      const { text, status } = capFileText(raw);
      results.push({ file_name: a.file_name, status, text });
    } catch (err) {
      logErr(`attachment ${a.file_name}:`, err.message);
      results.push({ file_name: a.file_name, status: 'error', text: '' });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Process one job end-to-end
// ---------------------------------------------------------------------------
async function processJob(job) {
  const { job_id: jobId, booking_id: bookingId } = job;
  const t0 = Date.now();
  log(`job ${jobId.slice(0, 8)} · booking ${bookingId.slice(0, 8)} · start`);

  try {
    const inputs = await fetchSummaryInputs(bookingId);
    if (!inputs?.booking) {
      throw new Error('booking not found');
    }

    const fileTexts = await collectAttachmentTexts(bookingId);

    const summary = await summarize({
      inputs,
      fileTexts,
      ollama: {
        baseUrl:   OLLAMA_BASE_URL,
        model:     OLLAMA_MODEL,
        timeoutMs: OLLAMA_TIMEOUT_MS,
      },
      log: (msg) => log(`  ${msg}`),
    });

    // Tag source-usage stats onto the summary so the UI can show what
    // got included (mirrors the old Gemini API contract).
    summary._files = fileTexts.map((f) => ({
      file_name: f.file_name,
      status:    f.status,
    }));
    summary._used_audio = !!inputs.audio_note?.transcript;
    summary._model = OLLAMA_MODEL;

    await saveSummary(bookingId, summary);
    await finishJob(jobId, true, null);

    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    log(`job ${jobId.slice(0, 8)} · done in ${dt}s`);
  } catch (err) {
    const msg = err?.message || String(err);
    logErr(`job ${jobId.slice(0, 8)} failed:`, msg);
    try { await finishJob(jobId, false, msg.slice(0, 500)); }
    catch (e) { logErr('finishJob also failed:', e.message); }
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
async function tick() {
  try {
    const job = await claimNextJob();
    if (!job) return false;
    await processJob(job);
    return true;
  } catch (err) {
    logErr('tick:', err.message || err);
    return false;
  }
}

async function preflight() {
  // 1. Supabase reachable?
  try {
    const { error } = await sb.rpc('mtg_claim_next_summary_job');
    // Allowed errors: function returned no rows. We just want the round-trip
    // to succeed. If error mentions auth/permission, surface it.
    if (error && /permission|jwt|auth/i.test(error.message)) {
      throw new Error(`Supabase auth: ${error.message}`);
    }
  } catch (err) {
    logErr('preflight: cannot reach Supabase —', err.message || err);
    process.exit(2);
  }

  // 2. Ollama reachable?
  try {
    const r = await fetch(`${OLLAMA_BASE_URL.replace(/\/$/, '')}/api/version`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const v = await r.json();
    log(`Ollama OK · version ${v.version}`);
  } catch (err) {
    logErr(`preflight: cannot reach Ollama at ${OLLAMA_BASE_URL} —`, err.message);
    logErr('  → start it with `ollama serve` (or check OLLAMA_BASE_URL in .env)');
    process.exit(3);
  }

  // 3. Model pulled?
  try {
    const r = await fetch(`${OLLAMA_BASE_URL.replace(/\/$/, '')}/api/tags`);
    const data = await r.json();
    const names = (data.models || []).map((m) => m.name);
    if (!names.some((n) => n.startsWith(OLLAMA_MODEL.split(':')[0]))) {
      logErr(`preflight: model "${OLLAMA_MODEL}" not pulled. Run:`);
      logErr(`  ollama pull ${OLLAMA_MODEL}`);
      process.exit(4);
    }
    log(`Model ${OLLAMA_MODEL} OK`);
  } catch (err) {
    logErr('preflight: model check failed —', err.message);
  }
}

async function main() {
  log('worker starting');
  log(`  Supabase  : ${SUPABASE_URL}`);
  log(`  Ollama    : ${OLLAMA_BASE_URL}`);
  log(`  Model     : ${OLLAMA_MODEL}`);
  log(`  Poll every: ${WORKER_POLL_MS} ms`);
  log(`  Mode      : ${RUN_ONCE ? 'once' : 'loop'}`);

  await preflight();

  if (RUN_ONCE) {
    const did = await tick();
    if (!did) log('no queued jobs');
    return;
  }

  // Loop forever. SIGINT/SIGTERM exits cleanly.
  let stopping = false;
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      log(`${sig} received — stopping after current tick`);
      stopping = true;
    });
  }

  while (!stopping) {
    const busy = await tick();
    if (stopping) break;
    if (!busy) {
      await new Promise((r) => setTimeout(r, WORKER_POLL_MS));
    }
  }
  log('worker stopped');
}

main().catch((err) => {
  logErr('fatal:', err);
  process.exit(1);
});
