-- Migration v16 · 2026-05-08
-- Async meeting summary: persist the Gemini Files API handle so the
-- 3-step Vercel flow (upload → poll → generate) can resume between
-- requests instead of doing everything in one 60-second function call.

alter table public.mtg_meeting_notes
  add column if not exists gemini_file_uri  text,
  add column if not exists gemini_file_name text,
  add column if not exists gemini_mime_type text;

-- Bump bucket size while we're here so longer recordings fit.
-- 1-2 hour meetings at the new lower bitrate easily exceed 25MB.
update storage.buckets
   set file_size_limit = 104857600  -- 100 MB
 where id = 'mtg-audio';
