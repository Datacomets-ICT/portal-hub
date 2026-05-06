-- Meeting Rooms schema
-- Run once in Supabase Dashboard → SQL Editor → New query → paste → Run

-- Drop (safe re-run)
drop table if exists public.bookings cascade;
drop table if exists public.rooms cascade;
drop table if exists public.employees cascade;

-- Rooms
create table public.rooms (
  id          text primary key,
  name        text not null,
  picture     text,
  location    text,
  floor       text,
  seats       int,
  status      text default 'available',
  created_at  timestamptz default now()
);

-- Employees
create table public.employees (
  code        text primary key,
  name        text not null,
  nickname    text,
  dept        text,
  position    text,
  created_at  timestamptz default now()
);

-- Bookings
create extension if not exists btree_gist;

create table public.bookings (
  id            uuid primary key default gen_random_uuid(),
  room_id       text not null references public.rooms(id) on delete cascade,
  booking_date  date not null,
  start_min     int  not null,
  end_min       int  not null,
  title         text not null,
  booker        text,
  attendees     int,
  purpose       text,
  company       text,
  equipment     text[] default '{}',
  refreshments  text[] default '{}',
  created_at    timestamptz default now(),
  check (end_min > start_min),
  check (start_min >= 0 and end_min <= 1440),
  constraint no_overlap exclude using gist (
    room_id      with =,
    booking_date with =,
    int4range(start_min, end_min) with &&
  )
);

create index bookings_room_date_idx on public.bookings (room_id, booking_date);
create index bookings_date_idx      on public.bookings (booking_date);

-- Row-Level Security (public read/write for demo)
alter table public.rooms      enable row level security;
alter table public.employees  enable row level security;
alter table public.bookings   enable row level security;

create policy "rooms_read"      on public.rooms      for select using (true);
create policy "employees_read"  on public.employees  for select using (true);
create policy "bookings_all"    on public.bookings   for all    using (true) with check (true);
