-- Migration v2 · 2026-04-23
-- Run this ONCE in Supabase SQL Editor on the existing DB.
-- If this is a fresh install, use supabase/schema.sql instead (it already includes these).

-- 1. Add refreshments column for catering prep (used when purpose = 'รับรองลูกค้า')
alter table public.bookings
  add column if not exists refreshments text[] default '{}';

-- 2. Prevent overlapping bookings at DB level (defense-in-depth with client-side check)
create extension if not exists btree_gist;

-- Drop first to allow re-runs
alter table public.bookings drop constraint if exists no_overlap;

alter table public.bookings add constraint no_overlap exclude using gist (
  room_id      with =,
  booking_date with =,
  int4range(start_min, end_min) with &&
);
