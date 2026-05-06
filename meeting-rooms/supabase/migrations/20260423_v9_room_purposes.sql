-- Migration v9 · 2026-04-23
-- Add 'purposes' column to rooms. An array of allowed meeting purposes per room.
--   []  (empty / default) → room accepts ALL purposes (current behavior)
--   ['ประชุมภายใน','Workshop'] → room appears in wizard only for those purposes
-- Seed later from the list the user will provide.

alter table public.rooms
  add column if not exists purposes text[] default '{}';
