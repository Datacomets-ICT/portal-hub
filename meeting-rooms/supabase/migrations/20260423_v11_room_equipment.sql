-- Migration v11 · 2026-04-23
-- Rooms now track what they have (equipment, description) so admins can edit them.
-- Also allow public UPDATE on rooms so the admin UI can save changes (matches the
-- permissive model used for bookings; gating is in the client by role=admin).

alter table public.rooms
  add column if not exists equipment   text[] default '{}',
  add column if not exists description text;

drop policy if exists "rooms_update" on public.rooms;
create policy "rooms_update" on public.rooms
  for update using (true) with check (true);
