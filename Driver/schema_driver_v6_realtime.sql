-- Driver migration v6 — Real-time trip status + GPS + rating
--
-- Adds three independent feature stacks, all on top of drv_bookings:
--
--   A. trip_status       — driver presses 4 buttons during the trip,
--                          booker sees live progress badge
--   B. drv_locations     — driver phone uploads GPS every 30s while
--                          actively sharing; booker sees a pin on map
--   C. trip_rating       — booker rates 1-5 stars after trip done
--
-- All idempotent.

-- ============================================================================
-- A. Trip-status column
-- ============================================================================
-- Existing `status` column is the APPROVAL workflow
-- (pending/approved/rejected/completed/cancelled). We need a SEPARATE
-- column for the IN-TRIP states so the two don't collide.
alter table public.drv_bookings
  add column if not exists trip_status text default 'idle',
  add column if not exists trip_status_updated_at timestamptz;

-- Allowed values: idle | on_the_way | picked_up | delivered | done
-- (we don't constrain via CHECK because legacy rows might be NULL)

-- A1. RPC — update trip status. Anyone with the booking_no can call
-- (for now — drivers are trusted internally and don't have logins).
-- Future hardening: pass driver_id and verify they're the assigned driver.
create or replace function public.drv_set_trip_status(
  p_booking_no text,
  p_status     text
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
begin
  if p_status not in ('idle', 'on_the_way', 'picked_up', 'delivered', 'done') then
    raise exception 'invalid trip_status: %', p_status;
  end if;

  update drv_bookings
     set trip_status = p_status,
         trip_status_updated_at = now(),
         -- When trip is fully done, also flip the approval status to
         -- 'completed' so the existing UI badges match reality.
         status = case when p_status = 'done' then 'completed' else status end
   where booking_no = p_booking_no;
end;
$body$;
revoke all on function public.drv_set_trip_status(text, text) from public;
grant execute on function public.drv_set_trip_status(text, text) to anon, authenticated;


-- ============================================================================
-- B. GPS location tracking
-- ============================================================================
-- One row per driver-location ping. Keep raw (don't overwrite) so we
-- can show a recent path/breadcrumbs if we want later. Auto-prune > 24h.
create table if not exists public.drv_locations (
  id          bigserial primary key,
  booking_no  text not null,
  lat         double precision not null,
  lng         double precision not null,
  accuracy_m  real,
  recorded_at timestamptz not null default now()
);
create index if not exists drv_locations_booking_idx
  on public.drv_locations (booking_no, recorded_at desc);

alter table public.drv_locations enable row level security;
drop policy if exists "drv_locations_read"  on public.drv_locations;
drop policy if exists "drv_locations_write" on public.drv_locations;
create policy "drv_locations_read"  on public.drv_locations for select using (true);
create policy "drv_locations_write" on public.drv_locations for insert with check (true);


-- B1. RPC — driver pings location
create or replace function public.drv_post_location(
  p_booking_no text,
  p_lat        double precision,
  p_lng        double precision,
  p_accuracy   real default null
)
returns void
language sql
security definer
set search_path = public
as $body$
  insert into drv_locations (booking_no, lat, lng, accuracy_m)
  values (p_booking_no, p_lat, p_lng, p_accuracy);
$body$;
revoke all on function public.drv_post_location(text, double precision, double precision, real) from public;
grant execute on function public.drv_post_location(text, double precision, double precision, real) to anon, authenticated;


-- B2. RPC — get the latest location for a booking (booker polls this)
create or replace function public.drv_get_location(p_booking_no text)
returns table (
  lat double precision,
  lng double precision,
  accuracy_m real,
  recorded_at timestamptz,
  age_seconds int
)
language sql
security definer
set search_path = public
as $body$
  select
    l.lat, l.lng, l.accuracy_m, l.recorded_at,
    extract(epoch from (now() - l.recorded_at))::int as age_seconds
  from drv_locations l
  where l.booking_no = p_booking_no
  order by l.recorded_at desc
  limit 1;
$body$;
revoke all on function public.drv_get_location(text) from public;
grant execute on function public.drv_get_location(text) to anon, authenticated;


-- B3. Auto-prune locations older than 24h (called by a cron job
-- or manually). Could also be done with pg_cron but keeping it manual
-- for now.
create or replace function public.drv_prune_locations()
returns int
language sql
security definer
set search_path = public
as $body$
  with deleted as (
    delete from drv_locations where recorded_at < now() - interval '24 hours'
    returning 1
  )
  select count(*)::int from deleted;
$body$;
revoke all on function public.drv_prune_locations() from public;
grant execute on function public.drv_prune_locations() to anon, authenticated;


-- ============================================================================
-- C. Trip rating
-- ============================================================================
alter table public.drv_bookings
  add column if not exists trip_rating         int check (trip_rating between 1 and 5),
  add column if not exists trip_rating_comment text,
  add column if not exists trip_rated_at       timestamptz;

-- C1. RPC — booker submits rating
create or replace function public.drv_rate_trip(
  p_booking_no text,
  p_rating     int,
  p_comment    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
begin
  if p_rating < 1 or p_rating > 5 then
    raise exception 'rating must be 1..5';
  end if;
  update drv_bookings
     set trip_rating = p_rating,
         trip_rating_comment = p_comment,
         trip_rated_at = now()
   where booking_no = p_booking_no;
end;
$body$;
revoke all on function public.drv_rate_trip(text, int, text) from public;
grant execute on function public.drv_rate_trip(text, int, text) to anon, authenticated;


-- C2. View — driver scorecard (for admin dashboard later)
create or replace view public.drv_driver_scorecard as
select
  d.id          as driver_id,
  d.name        as driver_name,
  count(b.trip_rating)            as ratings_count,
  round(avg(b.trip_rating)::numeric, 2) as avg_rating,
  count(b.*)                      as trips_total
from drv_drivers d
left join drv_bookings b on b.driver_id = d.id and b.trip_rating is not null
group by d.id, d.name;
grant select on public.drv_driver_scorecard to anon, authenticated;
