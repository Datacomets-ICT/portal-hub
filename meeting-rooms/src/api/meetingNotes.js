// Meeting summary helpers — primary flow uses Groq Whisper + Groq LLM
// in a single backend call; Gemini Files API is the fallback path.
//
//   1. upload audio to Supabase Storage (TUS resumable for files > 6 MB)
//   2. POST /api/meeting-summary?step=process
//   3. (on Groq failure) Gemini 3-step path

import * as tus from 'tus-js-client';
import { supabase } from '../lib/supabase.js';

const BUCKET = 'mtg-audio';
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS  = 10 * 60 * 1000; // 10 min — long meetings can take a while

// Files <= 6 MB go through the simple SDK upload (one HTTP request),
// larger ones use TUS resumable so we don't hit Supabase's 50 MB
// single-shot limit. 6 MB matches the standard TUS chunk size.
const RESUMABLE_THRESHOLD = 6 * 1024 * 1024;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Upload `file` to Supabase Storage. Picks single-shot or TUS based on
// size. `onProgress(percent, bytesUploaded, bytesTotal)` reports
// upload progress (only meaningful for resumable uploads).
async function uploadAudioToStorage(path, file, onProgress) {
  if (file.size <= RESUMABLE_THRESHOLD) {
    // Small file — fast single-shot upload via the SDK.
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || 'audio/webm' });
    if (error) throw error;
    if (onProgress) onProgress(100, file.size, file.size);
    return;
  }

  // Large file — TUS resumable upload. Each chunk is its own request,
  // so any single one fits well under the 50 MB ceiling.
  await new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${SUPABASE_ANON_KEY}`,
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
      onError: (err) => reject(err),
      onProgress: (uploaded, total) => {
        if (onProgress) onProgress(Math.round((uploaded / total) * 100), uploaded, total);
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

  // 3) Primary: Groq Whisper + Groq LLM (single call). Better Thai
  //    transcription than Gemini and the free quota is far larger.
  //    Fallback: Gemini Files API path if Groq has issues.
  try {
    progress('process', { note: row });
    await callApi('process', { note_id: row.id });
  } catch (err) {
    console.warn('[meetingNotes] Groq Whisper path failed — trying Gemini fallback', err);
    progress('upload');
    const uploadRes = await callApi('upload', {
      note_id: row.id,
      audio_url: audioUrl,
      mime_type: file.type || 'audio/webm',
    });
    if (uploadRes.state !== 'ACTIVE') {
      progress('processing');
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await new Promise(res => setTimeout(res, POLL_INTERVAL_MS));
        const pollRes = await callApi('poll', { note_id: row.id });
        if (pollRes.state === 'ACTIVE') break;
        if (pollRes.state === 'FAILED') throw new Error('Gemini file processing FAILED');
      }
    }
    progress('generate');
    await callApi('generate', { note_id: row.id });
  }

  progress('done');
  return await getNoteForBooking(bookingId);
}

// Resume from a partial note (retry after failure or reload).
// Same primary→fallback chain as startMeetingSummary.
export async function resumeMeetingSummary(note, onProgress) {
  if (!note?.id) throw new Error('note required');
  const progress = onProgress || (() => {});
  if (note.status === 'done') return note;

  try {
    progress('process');
    await callApi('process', { note_id: note.id });
  } catch (err) {
    console.warn('[meetingNotes] resume: Groq Whisper failed, trying Gemini', err);
    if (!note.audio_url) throw err;
    progress('upload');
    const r = await callApi('upload', {
      note_id: note.id,
      audio_url: note.audio_url,
      mime_type: 'audio/webm',
    });
    if (r.state !== 'ACTIVE') {
      progress('processing');
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await new Promise(res => setTimeout(res, POLL_INTERVAL_MS));
        const pollRes = await callApi('poll', { note_id: note.id });
        if (pollRes.state === 'ACTIVE') break;
        if (pollRes.state === 'FAILED') throw new Error('Gemini processing FAILED');
      }
    }
    progress('generate');
    await callApi('generate', { note_id: note.id });
  }

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
