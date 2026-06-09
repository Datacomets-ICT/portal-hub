-- Migration v30 · 2026-06-09
-- Extend file retention from 24 hours to 14 days, for BOTH audio
-- (mtg_meeting_notes.audio_expires_at) AND attachments (mtg_attachments).
--
-- Audio: bump the trigger default + push every still-existing audio
--   row's expiry forward to created_at + 14 days.
-- Attachments: add an `expires_at` column with the same 14-day rule and
--   matching trigger / index. The cleanup cron (api/meeting-cleanup.js)
--   will reap rows from BOTH tables.

-- ---------- audio: 24h → 14 days ----------
create or replace function public._set_audio_expiry()
returns trigger language plpgsql as $$
begin
  if new.audio_expires_at is null then
    new.audio_expires_at := coalesce(new.created_at, now()) + interval '14 days';
  end if;
  return new;
end;
$$;

-- Bump existing rows whose audio is still around — but only if the
-- current expiry is in the future or within the new window (don't
-- resurrect rows that already expired).
update public.mtg_meeting_notes
   set audio_expires_at = created_at + interval '14 days'
 where audio_path is not null
   and audio_expires_at < created_at + interval '14 days'
   and audio_expires_at > now() - interval '7 days';   -- recent rows only


-- ---------- attachments: add expiry + trigger ----------
alter table public.mtg_attachments
  add column if not exists expires_at timestamptz;

-- Backfill: every existing attachment gets a 14-day expiry from its
-- upload time. We don't expire rows in the past (let the next cron
-- pick them up immediately).
update public.mtg_attachments
   set expires_at = uploaded_at + interval '14 days'
 where expires_at is null;

create or replace function public._set_attachment_expiry()
returns trigger language plpgsql as $$
begin
  if new.expires_at is null then
    new.expires_at := coalesce(new.uploaded_at, now()) + interval '14 days';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mtg_set_attachment_expiry on public.mtg_attachments;
create trigger trg_mtg_set_attachment_expiry
  before insert on public.mtg_attachments
  for each row execute function public._set_attachment_expiry();

create index if not exists idx_mtg_attachments_expires
  on public.mtg_attachments(expires_at)
  where storage_path is not null;
