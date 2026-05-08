-- Migration v17 · 2026-05-08
-- Richer meeting summary structure for the export feature:
--   decisions          — explicit decisions reached (separate from discussion)
--   discussion_topics  — bullet groups by topic
--   next_meeting       — natural-language scheduled follow-up (if mentioned)
-- All optional; old rows just leave them null.

alter table public.mtg_meeting_notes
  add column if not exists decisions          jsonb,
  add column if not exists discussion_topics  jsonb,
  add column if not exists next_meeting       text;
