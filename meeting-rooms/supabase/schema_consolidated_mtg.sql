-- =====================================================================
-- Meeting Rooms — consolidated schema for Datacomets Project
-- =====================================================================
-- One-shot migration. Tables are namespaced `mtg_` to avoid clashing
-- with IT-Ticket / Driver tables in the same Supabase project
-- (dixechuojsfaypagbfqu).
--
-- Run once in Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run (drops tables before recreating).
-- =====================================================================

-- ---- Drop (re-runnable) ----
drop view  if exists public.mtg_employees  cascade;
drop table if exists public.mtg_bookings   cascade;
drop table if exists public.mtg_rooms      cascade;
drop table if exists public.mtg_employees  cascade;  -- in case it's a stale table from old runs

-- ---- Rooms ----
create table public.mtg_rooms (
  id          text primary key,
  name        text not null,
  picture     text,
  location    text,
  floor       text,
  seats       int,
  status      text default 'available',
  equipment   text[] default '{}',
  description text,
  purposes    text[] default '{}',
  created_at  timestamptz default now()
);

-- ---- Employees (VIEW over the shared `employees` table from IT/Driver) ----
-- Keeps a single source of truth so meeting-rooms always sees the same
-- roster as IT-Ticket / Driver. No seed needed — uses live data.
create view public.mtg_employees as
select
  employee_id                                                  as code,
  trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) as name,
  nickname,
  department                                                    as dept,
  position
from public.employees;

-- ---- Bookings ----
create extension if not exists btree_gist;

create table public.mtg_bookings (
  id              uuid primary key default gen_random_uuid(),
  room_id         text not null references public.mtg_rooms(id) on delete cascade,
  booking_date    date not null,
  start_min       int  not null,
  end_min         int  not null,
  title           text not null,
  booker          text,
  attendees       int,
  customer_count  int,
  purpose         text,
  company         text,
  equipment       text[] default '{}',
  refreshments    text[] default '{}',
  created_at      timestamptz default now(),
  check (end_min > start_min),
  check (start_min >= 0 and end_min <= 1440),
  constraint mtg_no_overlap exclude using gist (
    room_id      with =,
    booking_date with =,
    int4range(start_min, end_min) with &&
  )
);

create index mtg_bookings_room_date_idx on public.mtg_bookings (room_id, booking_date);
create index mtg_bookings_date_idx      on public.mtg_bookings (booking_date);

-- ---- RLS (permissive — admin gating happens client-side, like Driver) ----
alter table public.mtg_rooms      enable row level security;
alter table public.mtg_bookings   enable row level security;
-- mtg_employees is a view; it inherits the underlying table's RLS

drop policy if exists "mtg_rooms_read"      on public.mtg_rooms;
drop policy if exists "mtg_rooms_insert"    on public.mtg_rooms;
drop policy if exists "mtg_rooms_update"    on public.mtg_rooms;
drop policy if exists "mtg_rooms_delete"    on public.mtg_rooms;
drop policy if exists "mtg_bookings_all"    on public.mtg_bookings;

create policy "mtg_rooms_read"      on public.mtg_rooms      for select using (true);
create policy "mtg_rooms_insert"    on public.mtg_rooms      for insert with check (true);
create policy "mtg_rooms_update"    on public.mtg_rooms      for update using (true) with check (true);
create policy "mtg_rooms_delete"    on public.mtg_rooms      for delete using (true);
create policy "mtg_bookings_all"    on public.mtg_bookings   for all    using (true) with check (true);

-- The view needs anon SELECT — grant explicitly (RLS on underlying employees
-- table may block anon, so we expose the view directly).
grant select on public.mtg_employees to anon, authenticated;

-- ---- Storage bucket for room photos ----
insert into storage.buckets (id, name, public)
values ('mtg-room-photos', 'mtg-room-photos', true)
on conflict (id) do nothing;

drop policy if exists "mtg_room_photos_read"   on storage.objects;
drop policy if exists "mtg_room_photos_insert" on storage.objects;
drop policy if exists "mtg_room_photos_update" on storage.objects;
drop policy if exists "mtg_room_photos_delete" on storage.objects;

create policy "mtg_room_photos_read"   on storage.objects
  for select using (bucket_id = 'mtg-room-photos');
create policy "mtg_room_photos_insert" on storage.objects
  for insert with check (bucket_id = 'mtg-room-photos');
create policy "mtg_room_photos_update" on storage.objects
  for update using (bucket_id = 'mtg-room-photos')
  with check (bucket_id = 'mtg-room-photos');
create policy "mtg_room_photos_delete" on storage.objects
  for delete using (bucket_id = 'mtg-room-photos');

-- =====================================================================
-- Seed: rooms (36 rows, locations + statuses already corrected)
-- =====================================================================
insert into public.mtg_rooms (id, name, picture, location, floor, seats, status) values
  ('C001','ห้องมั่งคั่ง','rooms_Images/C001.jpg','Comets HQ','ชั้น 1',14,'unavailable'),
  ('C002','ห้องร่ำรวย','rooms_Images/C002.jpg','Comets HQ','ชั้น 1',10,'unavailable'),
  ('C003','ห้อง THE STAR','rooms_Images/C003.jpg','Comets HQ','ชั้น 2',20,'unavailable'),
  ('C004','ห้อง GALAXY','rooms_Images/C004.jpg','Comets HQ','ชั้น 2',16,'unavailable'),
  ('C005','ห้องเพิ่มพูน','rooms_Images/C005.jpg','Comets HQ','ชั้น 2',8,'unavailable'),
  ('C006','ห้องประชุมชั้น 1','rooms_Images/C006.jpg','Comets HQ','ชั้น 1',12,'unavailable'),
  ('C007','ห้องโถงชั้น 1','rooms_Images/C007.jpg','Comets HQ','ชั้น 1',30,'unavailable'),
  ('C008','ห้อง NORTH STAR','rooms_Images/C008.jpg','Comets HQ','ชั้น 3',12,'available'),
  ('C009','ห้อง JUPITER','rooms_Images/C009.jpg','Comets HQ','ชั้น 3',7,'available'),
  ('C010','ห้อง NEPTUNE','rooms_Images/C010.jpg','Comets HQ','ชั้น 3',7,'available'),
  ('C011','ห้องประชุมชั้น 3','rooms_Images/C011.jpg','Comets HQ','ชั้น 3',10,'unavailable'),
  ('C012','ห้อง MERCURY','rooms_Images/C012.jpg','Comets HQ','ชั้น 3',6,'available'),
  ('C013','ห้อง VENUS','rooms_Images/C013.jpg','Comets HQ','ชั้น 3',6,'available'),
  ('C014','ห้อง 2 B','rooms_Images/C014.jpg','ICT','ชั้น 2',8,'available'),
  ('C015','ห้อง Color','rooms_Images/C015.jpg','ICT','ชั้น 2',8,'available'),
  ('C016','ห้อง Innovation','rooms_Images/C016.jpg','ICT','ชั้น 2',10,'available'),
  ('C017','ห้อง Technology Room','rooms_Images/C017.jpg','ICT','ชั้น 2',12,'available'),
  ('C018','ห้อง 2 A','rooms_Images/C018.jpg','ICT','ชั้น 2',10,'available'),
  ('C019','ห้อง LIVE','rooms_Images/C019.jpg','Comets HQ','ชั้น 3',14,'unavailable'),
  ('C020','ห้อง 3B1','rooms_Images/C020.jpg','Comets HQ','ชั้น 3',7,'available'),
  ('C021','ห้อง 3B2','rooms_Images/C021.jpg','Comets HQ','ชั้น 3',7,'available'),
  ('C022','ห้อง TownHall 3M','rooms_Images/C022.jpg','Comets HQ','ชั้น 3',40,'available'),
  ('C023','PB3A1','rooms_Images/C023.jpg','Phone Booth','ชั้น 3',6,'available'),
  ('C024','PB3A2','rooms_Images/C024.png','Phone Booth','ชั้น 3',6,'available'),
  ('C025','PB3A3','rooms_Images/C025.jpg','Phone Booth','ชั้น 3',4,'available'),
  ('C026','PB3A4','rooms_Images/C026.jpg','Phone Booth','ชั้น 3',4,'available'),
  ('C027','PB3B1','rooms_Images/C027.png','Phone Booth','ชั้น 3',8,'available'),
  ('C028','PB4A1','rooms_Images/C028.jpg','Phone Booth','ชั้น 4',6,'available'),
  ('C029','PB4A2','rooms_Images/C029.png','Phone Booth','ชั้น 4',6,'available'),
  ('C030','PB4A3','rooms_Images/C030.png','Phone Booth','ชั้น 4',6,'available'),
  ('C031','ห้อง 4A1','rooms_Images/C031.jpg','Comets HQ','ชั้น 4',8,'available'),
  ('C032','ห้อง 4A2','rooms_Images/C032.jpg','Comets HQ','ชั้น 4',8,'available'),
  ('C033','ห้อง 4A3','rooms_Images/C033.jpg','Comets HQ','ชั้น 4',6,'available'),
  ('C034','โต๊ะประชุม 3B3','rooms_Images/C034.jpg','Comets HQ','ชั้น 3',4,'available'),
  ('C035','โต๊ะประชุม 3B4','rooms_Images/C035.jpg','Comets HQ','ชั้น 3',4,'available'),
  ('C036','PB ชั้น 1','rooms_Images/C036.jpg','Phone Booth','ชั้น 1',10,'available');

-- =====================================================================
-- Sample bookings (anchored to today + tomorrow)
-- =====================================================================
insert into public.mtg_bookings (room_id, booking_date, start_min, end_min, title, booker, attendees, purpose, company) values
  ('C008', current_date,      8*60+30,   9*60+30,  'Daily Standup',      'ธนพล อารีรักษ์',           9,  'ประชุมภายใน', null),
  ('C008', current_date,      14*60,     16*60,    'Quarterly Review',   'อภิญญา วงศ์สุข',           12, 'ประชุมภายใน', null),
  ('C009', current_date,      11*60,     12*60,    '1:1 with Manager',   'พิมพ์ชนก กิตติกุล',         2,  'ประชุมภายใน', null),
  ('C016', current_date,      9*60,      11*60,    'Innovation Jam',     'ศุภกร จันทร์เพ็ญ',          10, 'Workshop',    null),
  ('C017', current_date,      13*60+30,  15*60,    'Tech Demo',          'ธนพล อารีรักษ์',           8,  'รับรองลูกค้า', 'AIS Business'),
  ('C022', current_date,      15*60,     17*60,    'Town Hall ไตรมาส',   'ปิยะดา แสงทอง',            40, 'ประชุมภายใน', null),
  ('C014', current_date,      10*60,     11*60+30, 'Color Workshop',     'ชลิตา ภู่ระหงษ์',           6,  'Workshop',    null),
  ('C015', current_date,      14*60,     15*60,    'Design Review',      'ชลิตา ภู่ระหงษ์',           5,  'ประชุมภายใน', null),
  ('C031', current_date,      9*60,      10*60,    'Finance Close',      'กมลชนก สุวรรณ',            4,  'ประชุมภายใน', null),
  ('C012', current_date,      13*60,     14*60,    'HR Screening',       'เจกิตาน์ ศรีสวัสดิ์',       3,  'สัมภาษณ์งาน',  null);

-- =====================================================================
-- Done. Employees come from `mtg_employees` view → no separate seed needed.
-- =====================================================================
