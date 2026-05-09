// Meeting summary helpers — primary flow uses Groq Whisper + Groq LLM
// in a single backend call; Gemini Files API is the fallback path.
//
//   1. upload audio to Supabase Storage (TUS resumable for files > 6 MB)
//   2. POST /api/meeting-summary?step=process
//   3. (on Groq failure) Gemini 3-step path

import * as tus from 'tus-js-client';
import { supabase } from '../lib/supabase.js';
import { compressIfLarge } from '../audioCompressor.js';

const BUCKET = 'mtg-audio';
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS  = 10 * 60 * 1000; // 10 min — long meetings can take a while

// Files <= 6 MB go through the simple SDK upload (one HTTP request),
// larger ones use TUS resumable so we don't hit Supabase's 50 MB
// single-shot limit. 6 MB matches the standard TUS chunk size.
const RESUMABLE_THRESHOLD = 6 * 1024 * 1024;
const SDK_SINGLE_SHOT_LIMIT = 50 * 1024 * 1024;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
// TUS endpoint requires a JWT-format key (eyJ...). The newer
// "publishable" keys (sb_publishable_*) fail with "Invalid Compact
// JWS". Users who want big-file uploads must set VITE_SUPABASE_LEGACY_JWT
// to the legacy JWT-format anon key (still available in Supabase
// Dashboard → Settings → API → Legacy keys).
const LEGACY_JWT = import.meta.env.VITE_SUPABASE_LEGACY_JWT || '';

function isJwtFormat(key) {
  return typeof key === 'string' && key.startsWith('eyJ');
}

// Pick the best key for a TUS Bearer header.
function tusAuthKey() {
  if (isJwtFormat(LEGACY_JWT)) return LEGACY_JWT;
  if (isJwtFormat(SUPABASE_ANON_KEY)) return SUPABASE_ANON_KEY;
  return null;
}

// Exposed so the UI can show "✓ Resumable upload พร้อมใช้" or warn
// when the legacy JWT key wasn't baked into the build. Knowing this
// up-front beats discovering it only after a 2-minute upload attempt.
export function getResumableUploadStatus() {
  const anonIsJwt = isJwtFormat(SUPABASE_ANON_KEY);
  const legacyIsJwt = isJwtFormat(LEGACY_JWT);
  if (legacyIsJwt) {
    return { ok: true, source: 'legacy', preview: LEGACY_JWT.slice(0, 12) + '…' };
  }
  if (anonIsJwt) {
    return { ok: true, source: 'anon', preview: SUPABASE_ANON_KEY.slice(0, 12) + '…' };
  }
  return {
    ok: false,
    source: null,
    anonStart: SUPABASE_ANON_KEY ? SUPABASE_ANON_KEY.slice(0, 16) + '…' : '(empty)',
    legacyStart: LEGACY_JWT ? LEGACY_JWT.slice(0, 16) + '…' : '(empty)',
  };
}

// Upload `file` to Supabase Storage. Picks single-shot or TUS based on
// size. `onProgress(percent, bytesUploaded, bytesTotal)` reports
// upload progress.
//
// Silent pre-step: files over the compression threshold (30 MB) are
// re-encoded to 32 kbps mono MP3 in a Web Worker first, so a 96 MB
// Zoom export becomes a ~12 MB upload that comfortably fits Supabase
// Free's 50 MB hard ceiling. The user sees a single smooth progress
// bar — they don't know compression is happening.
async function uploadAudioToStorage(path, file, onProgress) {
  // When we compressed, the upload bar starts at 35 % (compression
  // already pushed it that far). Otherwise it starts at 0 %.
  let uploadStart = 0;

  if (file.size > 30 * 1024 * 1024) {
    const original = file;
    file = await compressIfLarge(file, (compPct) => {
      // Compression: 0 → 35 % of the overall bar
      if (onProgress) onProgress(Math.round(compPct * 0.35), 0, original.size);
    });
    if (file !== original) {
      uploadStart = 35;
      if (/\.\w+$/.test(path)) path = path.replace(/\.\w+$/, '.mp3');
    }
  }

  // Helper that maps a 0–100 upload percent into the [uploadStart, 100]
  // range so the bar moves smoothly across both phases.
  const reportUpload = (pct, uploaded, total) => {
    if (!onProgress) return;
    const mapped = uploadStart + Math.round((pct / 100) * (100 - uploadStart));
    onProgress(Math.min(100, mapped), uploaded, total);
  };

  // Small file → SDK single-shot is fastest.
  if (file.size <= RESUMABLE_THRESHOLD) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || 'audio/webm' });
    if (error) throw error;
    reportUpload(100, file.size, file.size);
    return;
  }

  const jwtKey = tusAuthKey();

  // Large file but no JWT available → try SDK single-shot if it'll fit
  // (≤50 MB). Otherwise we have to ask the user to configure a JWT key.
  if (!jwtKey) {
    if (file.size <= SDK_SINGLE_SHOT_LIMIT) {
      console.warn('[upload] no JWT key for TUS — using SDK single-shot');
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type || 'audio/webm' });
      if (error) throw error;
      reportUpload(100, file.size, file.size);
      return;
    }
    throw new Error(
      `ไฟล์ใหญ่ ${(file.size / 1024 / 1024).toFixed(1)}MB ต้องใช้ resumable upload ` +
      'ซึ่งต้องการ Legacy JWT key — กรุณาตั้ง VITE_SUPABASE_LEGACY_JWT ใน Vercel ' +
      '(ดูคีย์ใน Supabase Dashboard → Settings → API → Legacy JWT keys → anon)'
    );
  }

  // Large file + JWT available → TUS resumable upload.
  await new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${jwtKey}`,
        apikey: SUPABASE_ANON_KEY,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: BUCKET,
        objectName: path,
        contentType: file.type || 'audio/webm',
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024,
      onError: (err) => {
        const msg = String(err.message || err);
        if (msg.includes('Invalid Compact JWS') || msg.includes('Unauthorized')) {
          reject(new Error(
            'TUS auth ล้มเหลว — VITE_SUPABASE_LEGACY_JWT อาจไม่ใช่ JWT ที่ถูกต้องของ project นี้'
          ));
        } else {
          reject(err);
        }
      },
      onProgress: (uploaded, total) => {
        reportUpload(Math.round((uploaded / total) * 100), uploaded, total);
      },
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}

export async function getNoteForBooking(bookingId) {
  if (!bookingId) return null;
  const { data, error } = await supabase
    .from('mtg_meeting_notes')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('[meetingNotes] getNoteForBooking', error);
    return null;
  }
  return data;
}

async function callApi(step, body) {
  const r = await fetch(`/api/meeting-summary?step=${step}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const errText = await r.text();
    const err = new Error(`step=${step} failed (${r.status}): ${errText.slice(0, 200)}`);
    err.status = r.status;
    err.body = errText;
    throw err;
  }
  return await r.json();
}

// "Quota exceeded" / "rate limit" — anything that's worth swapping
// providers for. We treat both 429 from us and a Gemini 429 inside a
// 500-from-us as the same trigger.
function isQuotaError(err) {
  if (!err) return false;
  if (err.status === 429) return true;
  const blob = (err.body || err.message || '').toString().toLowerCase();
  return blob.includes('429') || blob.includes('quota') || blob.includes('rate limit');
}

// Drive the entire pipeline in one call. Returns the final note row.
// Caller is responsible for showing intermediate UI based on the
// `onProgress(stage, info)` callback. Stages: 'storage', 'upload',
// 'processing', 'generate', 'done'.
export async function startMeetingSummary({ bookingId, file, createdBy, onProgress }) {
  if (!bookingId || !file) throw new Error('bookingId and file required');
  const progress = onProgress || (() => {});

  // 1) Upload to Supabase Storage (TUS for large files, SDK for small)
  progress('storage', { uploadPercent: 0 });
  const ext = (file.name?.split('.').pop() || 'webm').toLowerCase();
  const ts = Date.now();
  const path = `${bookingId}/${ts}.${ext}`;
  await uploadAudioToStorage(path, file, (percent) => {
    progress('storage', { uploadPercent: percent });
  });
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const audioUrl = pub.publicUrl;

  // 2) Insert pending row
  const { data: row, error: insErr } = await supabase
    .from('mtg_meeting_notes')
    .insert({
      booking_id: bookingId,
      audio_path: path,
      audio_url: audioUrl,
      status: 'uploading',
      created_by: createdBy || null,
    })
    .select()
    .single();
  if (insErr) throw insErr;

  // 3) Three-layer transcription fallback chain. Each provider lives
  //    on a separate quota pool, so it takes all three being exhausted
  //    at once for the user to see an error.
  //
  //      1. Groq Whisper (480 min/day free)        — primary
  //      2. Gemini Files API (1500 calls/day free) — fallback
  //      3. Deepgram Nova-2 ($200 free credit)     — last resort
  await runTranscriptionChain(row.id, audioUrl, file, progress);

  progress('done');
  return await getNoteForBooking(bookingId);
}

async function runTranscriptionChain(noteId, audioUrl, file, progress) {
  // Layer 1 — Whisper
  try {
    progress('process');
    await callApi('process', { note_id: noteId });
    return;
  } catch (err1) {
    console.warn('[meetingNotes] Whisper failed — trying Gemini', err1);
    // Layer 2 — Gemini Files API (3 sub-steps)
    try {
      progress('upload');
      const uploadRes = await callApi('upload', {
        note_id: noteId,
        audio_url: audioUrl,
        mime_type: file?.type || 'audio/webm',
      });
      if (uploadRes.state !== 'ACTIVE') {
        progress('processing');
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        while (Date.now() < deadline) {
          await new Promise(res => setTimeout(res, POLL_INTERVAL_MS));
          const pollRes = await callApi('poll', { note_id: noteId });
          if (pollRes.state === 'ACTIVE') break;
          if (pollRes.state === 'FAILED') throw new Error('Gemini file processing FAILED');
        }
      }
      progress('generate');
      await callApi('generate', { note_id: noteId });
      return;
    } catch (err2) {
      console.warn('[meetingNotes] Gemini failed — trying Deepgram', err2);
      // Layer 3 — Deepgram
      progress('deepgram');
      await callApi('deepgram', { note_id: noteId });
    }
  }
}

// Resume from a partial note (retry after failure or reload).
// Same 3-layer chain as startMeetingSummary.
export async function resumeMeetingSummary(note, onProgress) {
  if (!note?.id) throw new Error('note required');
  const progress = onProgress || (() => {});
  if (note.status === 'done') return note;
  if (!note.audio_url) throw new Error('No audio_url on note');

  await runTranscriptionChain(note.id, note.audio_url, { type: 'audio/webm' }, progress);
  progress('done');
  return await getNoteForBooking(note.booking_id);
}

export async function deleteMeetingNote(note) {
  if (!note?.id) return;
  if (note.audio_path) {
    await supabase.storage.from(BUCKET).remove([note.audio_path]);
  }
  await supabase.from('mtg_meeting_notes').delete().eq('id', note.id);
}

// Drop just the audio file (keeps the summary text). Used by the
// "audio expired" auto-cleanup so the row + transcript live forever
// but the heavy MP3 doesn't sit in Supabase storage burning quota.
export async function purgeExpiredAudio(note) {
  if (!note?.id || !note?.audio_path) return;
  try {
    await supabase.storage.from(BUCKET).remove([note.audio_path]);
  } catch (e) {
    console.warn('[meetingNotes] purge storage failed', e);
  }
  await supabase
    .from('mtg_meeting_notes')
    .update({
      audio_path: null,
      audio_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', note.id);
}
