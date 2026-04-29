-- ============================================================
-- Driver Booking — v1 schema (Supabase / Postgres)
--
-- 4 tables (drv_*) + 5 RPCs. Tables prefixed so they can't collide
-- with the existing IT-Ticket schema in the same Supabase project.
--
-- Workflow:
--   user creates booking         → status = 'pending'
--   manager approves / rejects   → 'approved' | 'rejected'
--   admin assigns car + driver   → still 'approved' (just fills car_id/driver_id)
--   trip ends                    → 'completed'
--   user cancels (pending only)  → 'cancelled'
--
-- Safe to re-run: every CREATE uses IF NOT EXISTS / OR REPLACE.
-- The seed at the bottom is guarded with NOT EXISTS so it doesn't
-- duplicate after the first run.
-- ============================================================

-- ===== 1. Master tables =====

create table if not exists drv_drivers (
  id          bigserial primary key,
  driver_no   text unique,
  name        text not null,
  phone       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists drv_cars (
  id          bigserial primary key,
  plate       text unique not null,
  model       text,
  seats       int,
  color       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists drv_places (
  id          bigserial primary key,
  name        text not null,
  detail      text,
  map_url     text,
  kind        text not null default 'both',   -- 'pickup' | 'dropoff' | 'both'
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ===== 2. Bookings =====

create table if not exists drv_bookings (
  key             bigserial primary key,
  booking_no      text unique not null,        -- BKYYMM####
  created_at      timestamptz not null default now(),

  employee_id     text,
  employee_name   text,
  employee_phone  text,
  employee_dept   text,

  date            date not null,
  time_out        time not null,
  time_arrive     time not null,
  time_back       time not null,

  job_type        text,                         -- meeting / delivery / airport / etc.
  purpose         text,
  purpose_detail  text,

  -- Pickup: either pickup_id (master row) or free-text fields
  pickup_id       bigint references drv_places(id),
  pickup_name     text,
  pickup_detail   text,
  pickup_map      text,

  -- Dropoff
  dropoff_id      bigint references drv_places(id),
  dropoff_name    text,
  dropoff_detail  text,
  dropoff_map     text,

  -- Assignment (filled later)
  car_id          bigint references drv_cars(id),
  driver_id       bigint references drv_drivers(id),

  -- Workflow
  status          text not null default 'pending',   -- pending|approved|rejected|completed|cancelled
  approved_by     text,
  approved_at     timestamptz,
  rejected_reason text,
  assigned_by     text,
  assigned_at     timestamptz,
  cancelled_at    timestamptz,
  cancel_reason   text
);

create index if not exists drv_bookings_emp_idx    on drv_bookings(employee_id);
create index if not exists drv_bookings_date_idx   on drv_bookings(date desc);
create index if not exists drv_bookings_status_idx on drv_bookings(status);

-- ===== 3. RLS — anon can READ master tables only =====

alter table drv_drivers  enable row level security;
alter table drv_cars     enable row level security;
alter table drv_places   enable row level security;
alter table drv_bookings enable row level security;

drop policy if exists "drv_drivers_read" on drv_drivers;
create policy "drv_drivers_read" on drv_drivers
  for select to anon using (active = true);

drop policy if exists "drv_cars_read" on drv_cars;
create policy "drv_cars_read" on drv_cars
  for select to anon using (active = true);

drop policy if exists "drv_places_read" on drv_places;
create policy "drv_places_read" on drv_places
  for select to anon using (active = true);

-- bookings: NO direct anon access. All read/write via RPCs (auth-checked).

-- ===== 4. RPCs =====

-- ---- drv_create_booking — user creates a booking ----
create or replace function drv_create_booking(
  p_emp_id   text,
  p_password text,
  payload    json
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  emp           employees%rowtype;
  prefix        text;
  max_seq       int;
  new_seq       int;
  new_no        text;
  pickup_idv    bigint;
  dropoff_idv   bigint;
begin
  -- auth
  select * into emp from employees
   where employee_id = p_emp_id and password = p_password;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์');
  end if;

  -- generate booking_no = BK + YYMM + 4-digit seq
  prefix := 'BK' || to_char(now(), 'YYMM');
  select coalesce(max(substring(booking_no from length(prefix) + 1)::int), 0)
    into max_seq
    from drv_bookings
   where booking_no like prefix || '%'
     and substring(booking_no from length(prefix) + 1) ~ '^[0-9]+$';
  new_seq := max_seq + 1;
  new_no  := prefix || lpad(new_seq::text, 4, '0');

  pickup_idv  := nullif(payload->>'pickupId', '')::bigint;
  dropoff_idv := nullif(payload->>'dropoffId', '')::bigint;

  insert into drv_bookings (
    booking_no, employee_id, employee_name, employee_phone, employee_dept,
    date, time_out, time_arrive, time_back,
    job_type, purpose, purpose_detail,
    pickup_id, pickup_name, pickup_detail, pickup_map,
    dropoff_id, dropoff_name, dropoff_detail, dropoff_map,
    status
  ) values (
    new_no,
    emp.employee_id,
    trim(coalesce(emp.first_name,'') || ' ' || coalesce(emp.last_name,'')),
    coalesce(emp.phone, payload->>'phone'),
    coalesce(emp.department, ''),
    (payload->>'date')::date,
    (payload->>'timeOut')::time,
    (payload->>'timeArrive')::time,
    (payload->>'timeBack')::time,
    payload->>'jobType',
    payload->>'purpose',
    payload->>'purposeDetail',
    pickup_idv,
    payload->>'pickupName',
    payload->>'pickupDetail',
    payload->>'pickupMap',
    dropoff_idv,
    payload->>'dropoffName',
    payload->>'dropoffDetail',
    payload->>'dropoffMap',
    'pending'
  );

  return json_build_object(
    'success', true,
    'bookingNo', new_no
  );
end;
$$;

revoke all on function drv_create_booking(text, text, json) from public;
grant execute on function drv_create_booking(text, text, json) to anon, authenticated;


-- ---- drv_get_my_bookings — list bookings of the calling user ----
create or replace function drv_get_my_bookings(
  p_emp_id   text,
  p_password text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  emp employees%rowtype;
begin
  select * into emp from employees
   where employee_id = p_emp_id and password = p_password;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์');
  end if;

  return json_build_object(
    'success', true,
    'bookings', (
      select coalesce(json_agg(row_to_json(b) order by b.created_at desc), '[]'::json)
        from (
          select b.*, c.plate as car_plate, c.model as car_model, c.seats as car_seats, c.color as car_color,
                 d.driver_no as driver_no, d.name as driver_name, d.phone as driver_phone
            from drv_bookings b
            left join drv_cars c    on c.id = b.car_id
            left join drv_drivers d on d.id = b.driver_id
           where b.employee_id = p_emp_id
        ) b
    )
  );
end;
$$;

revoke all on function drv_get_my_bookings(text, text) from public;
grant execute on function drv_get_my_bookings(text, text) to anon, authenticated;


-- ---- drv_get_all_bookings — admin/manager/system view of every booking ----
create or replace function drv_get_all_bookings(
  p_emp_id   text,
  p_password text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  emp     employees%rowtype;
  v_role  text;
begin
  select * into emp from employees
   where employee_id = p_emp_id and password = p_password;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์');
  end if;

  v_role := coalesce(emp.role, 'user');
  if v_role not in ('manager','senior_manager','officer','system')
     and not coalesce(emp.is_admin, false) then
    return json_build_object('success', false, 'message', 'ต้องเป็น admin/manager');
  end if;

  return json_build_object(
    'success', true,
    'bookings', (
      select coalesce(json_agg(row_to_json(b) order by b.created_at desc), '[]'::json)
        from (
          select b.*, c.plate as car_plate, c.model as car_model, c.seats as car_seats, c.color as car_color,
                 d.driver_no as driver_no, d.name as driver_name, d.phone as driver_phone
            from drv_bookings b
            left join drv_cars c    on c.id = b.car_id
            left join drv_drivers d on d.id = b.driver_id
        ) b
    )
  );
end;
$$;

revoke all on function drv_get_all_bookings(text, text) from public;
grant execute on function drv_get_all_bookings(text, text) to anon, authenticated;


-- ---- drv_cancel_my_booking — user cancels their own pending booking ----
create or replace function drv_cancel_my_booking(
  p_emp_id      text,
  p_password    text,
  p_booking_key bigint,
  p_reason      text default null
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  emp employees%rowtype;
  bk  drv_bookings%rowtype;
begin
  select * into emp from employees
   where employee_id = p_emp_id and password = p_password;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์');
  end if;

  select * into bk from drv_bookings where key = p_booking_key;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่พบรายการจอง');
  end if;
  if bk.employee_id <> p_emp_id then
    return json_build_object('success', false, 'message', 'ยกเลิกได้เฉพาะรายการของตัวเอง');
  end if;
  if bk.status not in ('pending') then
    return json_build_object('success', false, 'message', 'ยกเลิกได้เฉพาะรายการที่ยังรออนุมัติ');
  end if;

  update drv_bookings set
    status        = 'cancelled',
    cancelled_at  = now(),
    cancel_reason = p_reason
   where key = p_booking_key;

  return json_build_object('success', true);
end;
$$;

revoke all on function drv_cancel_my_booking(text, text, bigint, text) from public;
grant execute on function drv_cancel_my_booking(text, text, bigint, text) to anon, authenticated;


-- ---- drv_update_booking — admin: approve / reject / assign car+driver / complete ----
create or replace function drv_update_booking(
  p_emp_id   text,
  p_password text,
  payload    json
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  emp        employees%rowtype;
  v_role     text;
  bk         drv_bookings%rowtype;
  k          bigint;
  new_status text;
  car_idv    bigint;
  drv_idv    bigint;
  reason     text;
  admin_lbl  text;
begin
  select * into emp from employees
   where employee_id = p_emp_id and password = p_password;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์');
  end if;
  v_role := coalesce(emp.role, 'user');
  if v_role not in ('manager','senior_manager','officer','system')
     and not coalesce(emp.is_admin, false) then
    return json_build_object('success', false, 'message', 'ต้องเป็น admin/manager');
  end if;

  k := (payload->>'key')::bigint;
  select * into bk from drv_bookings where key = k;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่พบรายการจอง');
  end if;

  new_status := coalesce(nullif(payload->>'status', ''), bk.status);
  car_idv    := nullif(payload->>'carId', '')::bigint;
  drv_idv    := nullif(payload->>'driverId', '')::bigint;
  reason     := payload->>'rejectedReason';
  admin_lbl  := trim(coalesce(emp.first_name,'') || ' ' || coalesce(emp.last_name,''));
  if admin_lbl = '' then admin_lbl := emp.employee_id; end if;

  -- transitions
  if new_status = 'approved' and bk.status not in ('pending','rejected') then
    return json_build_object('success', false, 'message', 'อนุมัติได้เฉพาะรายการที่รออนุมัติ');
  end if;

  update drv_bookings set
    status          = new_status,
    car_id          = coalesce(car_idv, car_id),
    driver_id       = coalesce(drv_idv, driver_id),
    approved_by     = case when new_status = 'approved'  and approved_by is null then admin_lbl else approved_by end,
    approved_at     = case when new_status = 'approved'  and approved_at is null then now()    else approved_at end,
    rejected_reason = case when new_status = 'rejected' then reason else rejected_reason end,
    assigned_by     = case when (car_idv is not null or drv_idv is not null) then admin_lbl else assigned_by end,
    assigned_at     = case when (car_idv is not null or drv_idv is not null) and assigned_at is null then now() else assigned_at end
   where key = k;

  return json_build_object('success', true);
end;
$$;

revoke all on function drv_update_booking(text, text, json) from public;
grant execute on function drv_update_booking(text, text, json) to anon, authenticated;


-- ============================================================
-- 5. Seed master data (one-time, guarded)
-- ============================================================

-- Pickup places
insert into drv_places (name, detail, map_url, kind)
select * from (values
  ('สำนักงานใหญ่ อาคาร A', 'ล็อบบี้ชั้น 1 ถ.พระราม 9',           'https://maps.google.com/?q=13.7563,100.5018', 'pickup'),
  ('โรงงาน บางพลี',        '123 ม.5 ต.บางพลีใหญ่ จ.สมุทรปราการ', 'https://maps.google.com/?q=13.6103,100.7450', 'pickup'),
  ('คลังสินค้า รังสิต',     'ถ.พหลโยธิน กม.35',                   'https://maps.google.com/?q=14.0132,100.7337', 'pickup'),
  ('ศูนย์ฝึกอบรม หัวหิน',   'ริมชายหาดหัวหิน',                     'https://maps.google.com/?q=12.5684,99.9580',  'pickup')
) v(name, detail, map_url, kind)
where not exists (select 1 from drv_places where drv_places.name = v.name);

-- Dropoff places
insert into drv_places (name, detail, map_url, kind)
select * from (values
  ('สนามบินสุวรรณภูมิ',       'อาคารผู้โดยสาร 1',          'https://maps.google.com/?q=13.6900,100.7501', 'dropoff'),
  ('สนามบินดอนเมือง',         'อาคาร 1 ผู้โดยสารในประเทศ', 'https://maps.google.com/?q=13.9125,100.6068', 'dropoff'),
  ('ศูนย์ประชุมสิริกิติ์',      'ถ.รัชดาภิเษก',               'https://maps.google.com/?q=13.7234,100.5602', 'dropoff'),
  ('ไบเทค บางนา',             'ถ.บางนา-ตราด กม.1',         'https://maps.google.com/?q=13.6672,100.6101', 'dropoff'),
  ('IMPACT เมืองทองธานี',     'ถ.แจ้งวัฒนะ',                'https://maps.google.com/?q=13.9136,100.5417', 'dropoff')
) v(name, detail, map_url, kind)
where not exists (select 1 from drv_places where drv_places.name = v.name);

-- Cars
insert into drv_cars (plate, model, seats, color)
select * from (values
  ('กท 1234', 'Toyota Commuter', 10, 'ขาว'),
  ('กท 5678', 'Toyota Fortuner',  7, 'เทา'),
  ('กท 9012', 'Honda Accord',     4, 'ดำ'),
  ('กท 3456', 'Isuzu D-Max',      4, 'น้ำเงิน')
) v(plate, model, seats, color)
where not exists (select 1 from drv_cars where drv_cars.plate = v.plate);

-- Drivers
insert into drv_drivers (driver_no, name, phone)
select * from (values
  ('DRV01', 'สมชาย ใจดี',     '081-111-2233'),
  ('DRV02', 'มานะ ขับดี',      '082-222-3344'),
  ('DRV03', 'ประยุทธ์ รอบคอบ', '083-333-4455')
) v(driver_no, name, phone)
where not exists (select 1 from drv_drivers where drv_drivers.driver_no = v.driver_no);
