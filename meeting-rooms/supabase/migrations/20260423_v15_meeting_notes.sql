-- Migration v15 · 2026-05-08
-- Meeting summary feature: store audio transcript + AI summary against
-- a booking. Audio uploaded to storage bucket, processed by
-- /api/meeting-summary (Gemini Flash audio), result written here.

create table if not exists public.mtg_meeting_notes (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid references public.mtg_bookings(id) on delete cascade,
  audio_path    text,                            -- storage path (mtg-audio/{booking_id}/{ts}.webm)
  audio_url     text,                            -- cached public URL for playback
  duration_sec  int,
  language      text default 'th',
  status        text default 'pending',          -- pending | processing | done | error
  error_message text,
  transcript    text,
  summary       text,
  action_items  jsonb,                           -- [{ task, owner, due }]
  created_by    text,                            -- employee_id
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_mtg_meeting_notes_booking
  on public.mtg_meeting_notes(booking_id);

alter table public.mtg_meeting_notes enable row level security;

drop policy if exists "mtg_meeting_notes_read" on public.mtg_meeting_notes;
create policy "mtg_meeting_notes_read" on public.mtg_meeting_notes
  for select using (true);

drop policy if exists "mtg_meeting_notes_insert" on public.mtg_meeting_notes;
create policy "mtg_meeting_notes_insert" on public.mtg_meeting_notes
  for insert with check (true);

drop policy if exists "mtg_meeting_notes_update" on public.mtg_meeting_notes;
create policy "mtg_meeting_notes_update" on public.mtg_meeting_notes
  for update using (true);

drop policy if exists "mtg_meeting_notes_delete" on public.mtg_meeting_notes;
create policy "mtg_meeting_notes_delete" on public.mtg_meeting_notes
  for delete using (true);

-- Storage bucket for audio uploads. Public-read so we can stream
-- playback in <audio> tags; writes/deletes are open since we gate
-- the upload UI client-side (only logged-in users see it).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mtg-audio', 'mtg-audio', true, 26214400, array[
  'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/mp3',
  'audio/wav', 'audio/x-m4a', 'audio/m4a', 'audio/ogg',
  'audio/x-wav', 'video/webm', 'video/mp4'
])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "mtg_audio_read" on storage.objects;
create policy "mtg_audio_read" on storage.objects
  for select using (bucket_id = 'mtg-audio');

drop policy if exists "mtg_audio_insert" on storage.objects;
create policy "mtg_audio_insert" on storage.objects
  for insert with check (bucket_id = 'mtg-audio');

drop policy if exists "mtg_audio_update" on storage.objects;
create policy "mtg_audio_update" on storage.objects
  for update using (bucket_id = 'mtg-audio')
  with check (bucket_id = 'mtg-audio');

drop policy if exists "mtg_audio_delete" on storage.objects;
create policy "mtg_audio_delete" on storage.objects
  for delete using (bucket_id = 'mtg-audio');
