// Meeting summary helpers — orchestrate the 3-step async flow:
//   1. upload audio to Supabase Storage
//   2. POST /api/meeting-summary?step=upload   (≤45 s — ship file to Gemini)
//   3. POST /api/meeting-summary?step=poll     (≤5 s — check Gemini state)
//      …repeat every 3 s until state === ACTIVE
//   4. POST /api/meeting-summary?step=generate (≤60 s — transcribe + summarise)

import { supabase } from '../lib/supabase.js';

const BUCKET = 'mtg-audio';
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS  = 10 * 60 * 1000; // 10 min — long meetings can take a while

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

  // 1) Upload to Supabase Storage
  progress('storage');
  const ext = (file.name?.split('.').pop() || 'webm').toLowerCase();
  const ts = Date.now();
  const path = `${bookingId}/${ts}.${ext}`;
  const upload = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || 'audio/webm' });
  if (upload.error) throw upload.error;
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
