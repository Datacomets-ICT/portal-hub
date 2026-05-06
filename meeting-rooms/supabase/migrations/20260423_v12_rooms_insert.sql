-- Migration v12 · 2026-04-23
-- Allow the admin UI to INSERT new rooms (client-side gated by isAdmin).

drop policy if exists "rooms_insert" on public.rooms;
create policy "rooms_insert" on public.rooms
  for insert with check (true);
