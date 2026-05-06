-- Migration v7 · 2026-04-23
-- Add a dedicated 'customer_count' column for hospitality bookings
-- (distinct from 'attendees' which counts employees).

alter table public.bookings
  add column if not exists customer_count int;
