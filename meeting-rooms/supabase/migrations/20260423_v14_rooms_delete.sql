-- Migration v14 · 2026-04-23
-- Allow the admin UI to DELETE rooms (client-side gated by isAdmin).
-- bookings.room_id already has ON DELETE CASCADE, so associated bookings
-- are removed automatically when a room is deleted.

drop policy if exists "rooms_delete" on public.rooms;
create policy "rooms_delete" on public.rooms
  for delete using (true);
