-- ============================================================
-- Driver v5 — let the booker edit their own pending booking
--
-- Mirrors drv_create_booking's payload shape but UPDATEs the row
-- instead of inserting. Locked to:
--   - the booking's own employee_id (you can only edit your own)
--   - status = 'pending' (admin hasn't approved yet)
-- ============================================================

create or replace function drv_update_my_booking(
  p_emp_id      text,
  p_password    text,
  p_booking_key bigint,
  payload       json
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  emp         employees%rowtype;
  bk          drv_bookings%rowtype;
  pickup_idv  bigint;
  dropoff_idv bigint;
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
    return json_build_object('success', false, 'message', 'แก้ไขได้เฉพาะรายการของตัวเอง');
  end if;
  if bk.status <> 'pending' then
    return json_build_object('success', false, 'message', 'แก้ไขได้เฉพาะรายการที่ยังรออนุมัติ');
  end if;

  pickup_idv  := nullif(payload->>'pickupId', '')::bigint;
  dropoff_idv := nullif(payload->>'dropoffId', '')::bigint;

  update drv_bookings set
    date            = (payload->>'date')::date,
    time_out        = (payload->>'timeOut')::time,
    time_arrive     = (payload->>'timeArrive')::time,
    time_back       = (payload->>'timeBack')::time,
    job_type        = payload->>'jobType',
    purpose         = payload->>'purpose',
    purpose_detail  = payload->>'purposeDetail',
    pickup_id       = pickup_idv,
    pickup_name     = payload->>'pickupName',
    pickup_detail   = payload->>'pickupDetail',
    pickup_map      = payload->>'pickupMap',
    dropoff_id      = dropoff_idv,
    dropoff_name    = payload->>'dropoffName',
    dropoff_detail  = payload->>'dropoffDetail',
    dropoff_map     = payload->>'dropoffMap'
   where key = p_booking_key;

  return json_build_object('success', true, 'bookingNo', bk.booking_no);
end;
$$;

revoke all on function drv_update_my_booking(text, text, bigint, json) from public;
grant execute on function drv_update_my_booking(text, text, bigint, json) to anon, authenticated;
