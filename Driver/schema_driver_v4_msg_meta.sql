-- ============================================================
-- Driver v4 — surface chat metadata on booking lists
--
-- Adds messages_count + last_message_at to drv_get_my_bookings and
-- drv_get_all_bookings. Frontend uses these to:
--   - render a "💬 N" badge on each booking card
--   - detect "new since last poll" → user-side toast when admin
--     sends a message
-- ============================================================

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
          select b.*,
                 c.plate as car_plate, c.model as car_model, c.seats as car_seats, c.color as car_color,
                 d.driver_no as driver_no, d.name as driver_name, d.phone as driver_phone,
                 m.messages_count, m.last_message_at, m.last_message_role
            from drv_bookings b
            left join drv_cars c    on c.id = b.car_id
            left join drv_drivers d on d.id = b.driver_id
            left join lateral (
              select count(*)::int                         as messages_count,
                     max(created_at)                       as last_message_at,
                     (array_agg(sender_role order by created_at desc))[1] as last_message_role
                from drv_booking_messages
               where booking_key = b.key
            ) m on true
           where b.employee_id = p_emp_id
        ) b
    )
  );
end;
$$;

revoke all on function drv_get_my_bookings(text, text) from public;
grant execute on function drv_get_my_bookings(text, text) to anon, authenticated;


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
          select b.*,
                 c.plate as car_plate, c.model as car_model, c.seats as car_seats, c.color as car_color,
                 d.driver_no as driver_no, d.name as driver_name, d.phone as driver_phone,
                 m.messages_count, m.last_message_at, m.last_message_role
            from drv_bookings b
            left join drv_cars c    on c.id = b.car_id
            left join drv_drivers d on d.id = b.driver_id
            left join lateral (
              select count(*)::int                         as messages_count,
                     max(created_at)                       as last_message_at,
                     (array_agg(sender_role order by created_at desc))[1] as last_message_role
                from drv_booking_messages
               where booking_key = b.key
            ) m on true
        ) b
    )
  );
end;
$$;

revoke all on function drv_get_all_bookings(text, text) from public;
grant execute on function drv_get_all_bookings(text, text) to anon, authenticated;
