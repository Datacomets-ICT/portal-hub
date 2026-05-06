-- Migration v13 · 2026-04-23
-- Storage bucket for room photos uploaded via the admin UI.
-- Files are named by room ID ({id}.{ext}), upserted on re-upload.

insert into storage.buckets (id, name, public)
values ('room-photos', 'room-photos', true)
on conflict (id) do nothing;

-- Public read (so <img src> works without auth)
drop policy if exists "room_photos_read" on storage.objects;
create policy "room_photos_read" on storage.objects
  for select using (bucket_id = 'room-photos');

-- Admin UI writes (client-side gated by isAdmin)
drop policy if exists "room_photos_insert" on storage.objects;
create policy "room_photos_insert" on storage.objects
  for insert with check (bucket_id = 'room-photos');

drop policy if exists "room_photos_update" on storage.objects;
create policy "room_photos_update" on storage.objects
  for update using (bucket_id = 'room-photos')
  with check (bucket_id = 'room-photos');

drop policy if exists "room_photos_delete" on storage.objects;
create policy "room_photos_delete" on storage.objects
  for delete using (bucket_id = 'room-photos');
