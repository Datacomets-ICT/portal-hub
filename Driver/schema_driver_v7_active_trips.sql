-- Driver migration v7 — Active trips view + RPC for the live dashboard
--
-- The "Live Drivers" page (everyone can view) shows all bookings with
-- trip_status in (on_the_way, picked_up) on a single map. This RPC
-- joins drv_bookings → drv_drivers → drv_cars → latest drv_locations
-- in one round-trip so the frontend doesn't have to fan out N+1
-- queries.
--
-- Idempotent.

create or replace function public.drv_active_trips()
returns table (
  booking_no       text,
  trip_status      text,
  trip_status_at   timestamptz,
  -- Trip endpoints
  pickup_name      text,
  dropoff_name     text,
  time_out         time,
  time_arrive      time,
  -- Driver
  driver_no        text,
  driver_name      text,
  driver_phone     text,
  -- Car
  car_plate        text,
  car_model        text,
  -- Booker (the user who reserved the trip)
  employee_id      text,
  employee_name    text,
  employee_dept    text,
  -- Latest GPS ping (NULL if driver hasn't started sharing yet)
  lat              double precision,
  lng              double precision,
  loc_age_seconds  int
)
language sql
security definer
set search_path = public
as $body$
  select
    b.booking_no,
    b.trip_status,
    b.trip_status_updated_at as trip_status_at,
    b.pickup_name,
    b.dropoff_name,
    b.time_out,
    b.time_arrive,
    d.driver_no,
    d.name  as driver_name,
    d.phone as driver_phone,
    c.plate as car_plate,
    c.model as car_model,
    b.employee_id,
    b.employee_name,
    b.employee_dept,
    loc.lat,
    loc.lng,
    loc.age_seconds
  from drv_bookings b
  left join drv_drivers d on d.id = b.driver_id
  left join drv_cars    c on c.id = b.car_id
  left join lateral (
    select l.lat, l.lng,
           extract(epoch from (now() - l.recorded_at))::int as age_seconds
    from drv_locations l
    where l.booking_no = b.booking_no
    order by l.recorded_at desc
    limit 1
  ) loc on true
  where b.trip_status in ('on_the_way', 'picked_up')
    and b.status = 'approved'   -- only show approved trips (no pending)
  order by b.trip_status_updated_at desc nulls last;
$body$;
revoke all on function public.drv_active_trips() from public;
grant execute on function public.drv_active_trips() to anon, authenticated;
