-- Migration v8 · 2026-04-23
-- Reset bookings table — start fresh.
-- Run in Supabase SQL Editor.
--
-- WARNING: this wipes ALL booking data (historical + future).
-- Run this only if you want to abandon the imported xlsx history
-- and build the dataset organically from live bookings going forward.

truncate public.bookings restart identity;
