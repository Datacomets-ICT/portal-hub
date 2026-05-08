// Meeting summary helpers — wrap Supabase + the Vercel /api/meeting-summary
// endpoint so the UI can stay declarative.

import { supabase } from '../lib/supabase.js';

const BUCKET = 'mtg-audio';

// Fetch the existing note (if any) for a booking. Returns null if not found.
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

// Upload audio to storage, then create a pending row + kick off /api/meeting-summary.
// Returns the inserted note row.
export async function startMeetingSummary({ bookingId, file, createdBy }) {
  if (!bookingId || !file) throw new Error('bookingId and file required');

  // Storage path: mtg-audio/{booking_id}/{timestamp}.{ext}
  const ext = (file.name.split('.').pop() || 'webm').toLowerCase();
  const ts = Date.now();
  const path = `${bookingId}/${ts}.${ext}`;

  const upload = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || 'audio/webm' });
  if (upload.error) throw upload.error;

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const audioUrl = pub.publicUrl;

  const { data: row, error: insErr } = await supabase
    .from('mtg_meeting_notes')
    .insert({
      booking_id: bookingId,
      audio_path: path,
      audio_url: audioUrl,
      duration_sec: null,
      status: 'processing',
      created_by: createdBy || null,
    })
    .select()
    .single();
  if (insErr) throw insErr;

  // Fire the AI processing — don't await, let UI poll. But we DO surface
  // network errors so the caller can show a toast.
  fetch('/api/meeting-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      note_id: row.id,
      audio_url: audioUrl,
      mime_type: file.type || 'audio/webm',
    }),
  }).catch(err => {
    console.warn('[meetingNotes] /api/meeting-summary fetch failed', err);
  });

  return row;
}

// Re-trigger processing for an existing note (e.g. retry after error).
export async function retryMeetingSummary(note) {
  if (!note?.id || !note?.audio_url) return;
  await supabase
    .from('mtg_meeting_notes')
    .update({ status: 'processing', error_message: null, updated_at: new Date().toISOString() })
    .eq('id', note.id);
  fetch('/api/meeting-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      note_id: note.id,
      audio_url: note.audio_url,
      mime_type: 'audio/webm',
    }),
  }).catch(() => {});
}

// Delete the note + its audio file.
export async function deleteMeetingNote(note) {
  if (!note?.id) return;
  if (note.audio_path) {
    await supabase.storage.from(BUCKET).remove([note.audio_path]);
  }
  await supabase.from('mtg_meeting_notes').delete().eq('id', note.id);
}
