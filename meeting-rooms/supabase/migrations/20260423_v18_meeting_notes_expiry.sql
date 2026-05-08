-- Migration v18 · 2026-05-08
-- Auto-expire the audio file 24 h after the note is created.
-- The transcript / summary / action_items stay forever (small text);
-- only the heavy MP3/webm in storage gets reaped so the 1 GB Supabase
-- free tier doesn't fill up after a dozen meetings.

alter table public.mtg_meeting_notes
  add column if not exists audio_expires_at timestamptz;

-- Backfill existing rows
update public.mtg_meeting_notes
   set audio_expires_at = created_at + interval '24 hours'
 where audio_expires_at is null and audio_path is not null;

-- New rows automatically get a 24-hour TTL on insert.
create or replace function public._set_audio_expiry()
returns trigger language plpgsql as $$
begin
  if new.audio_expires_at is null then
    new.audio_expires_at := coalesce(new.created_at, now()) + interval '24 hours';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mtg_set_audio_expiry on public.mtg_meeting_notes;
create trigger trg_mtg_set_audio_expiry
  before insert on public.mtg_meeting_notes
  for each row execute function public._set_audio_expiry();

create index if not exists idx_mtg_meeting_notes_expires
  on public.mtg_meeting_notes(audio_expires_at)
  where audio_path is not null;

-- Bump bucket size — resumable upload (tus) lets us go past Supabase's
-- 50 MB single-shot ceiling. Cap at 500 MB so a misclick can't fill
-- the project quota in one go.
update storage.buckets
   set file_size_limit = 524288000  -- 500 MB
 where id = 'mtg-audio';
