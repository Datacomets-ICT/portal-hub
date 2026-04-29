-- ============================================================
-- Driver v3 — booking chat (user ↔ admin) per booking
--
-- One thread per drv_bookings row. Either the booker or any
-- admin/manager can post + read. Plain text only (no attachments
-- yet — keep parity with v1 of IT-Ticket chat).
-- ============================================================

-- ===== Table =====
create table if not exists drv_booking_messages (
  id           bigserial primary key,
  booking_key  bigint not null references drv_bookings(key) on delete cascade,
  sender_id    text   not null,         -- employees.employee_id
  sender_name  text   not null,
  sender_role  text   not null check (sender_role in ('user','admin')),
  body         text   not null,
  created_at   timestamptz not null default now()
);

create index if not exists drv_msg_booking_idx
  on drv_booking_messages(booking_key, created_at);

alter table drv_booking_messages enable row level security;
-- No direct anon access. All read/write via SECURITY DEFINER RPCs.

-- ===== RPC: send message =====
create or replace function drv_send_message(
  p_emp_id      text,
  p_password    text,
  p_booking_key bigint,
  p_body        text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  emp     employees%rowtype;
  bk      drv_bookings%rowtype;
  v_role  text;
  is_adm  boolean;
  s_role  text;
  s_name  text;
begin
  if coalesce(trim(p_body), '') = '' then
    return json_build_object('success', false, 'message', 'พิมพ์ข้อความก่อน');
  end if;

  select * into emp from employees
   where employee_id = p_emp_id and password = p_password;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์');
  end if;

  select * into bk from drv_bookings where key = p_booking_key;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่พบรายการจอง');
  end if;

  v_role := coalesce(emp.role, 'user');
  is_adm := coalesce(emp.is_admin, false)
         or v_role in ('manager','senior_manager','officer','system');

  -- Allowed senders: the booking's own employee, OR any admin/manager
  if not is_adm and bk.employee_id <> p_emp_id then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์ส่งข้อความใน Ticket นี้');
  end if;

  s_role := case when is_adm then 'admin' else 'user' end;
  s_name := trim(coalesce(emp.first_name,'') || ' ' || coalesce(emp.last_name,''));
  if s_name = '' then s_name := emp.employee_id; end if;

  insert into drv_booking_messages(booking_key, sender_id, sender_name, sender_role, body)
  values (p_booking_key, emp.employee_id, s_name, s_role, trim(p_body));

  return json_build_object('success', true);
end;
$$;

revoke all on function drv_send_message(text, text, bigint, text) from public;
grant execute on function drv_send_message(text, text, bigint, text) to anon, authenticated;


-- ===== RPC: get messages =====
create or replace function drv_get_messages(
  p_emp_id      text,
  p_password    text,
  p_booking_key bigint
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  emp    employees%rowtype;
  bk     drv_bookings%rowtype;
  v_role text;
  is_adm boolean;
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

  v_role := coalesce(emp.role, 'user');
  is_adm := coalesce(emp.is_admin, false)
         or v_role in ('manager','senior_manager','officer','system');

  if not is_adm and bk.employee_id <> p_emp_id then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์ดูข้อความ');
  end if;

  return json_build_object(
    'success', true,
    'messages', (
      select coalesce(json_agg(row_to_json(m) order by m.created_at), '[]'::json)
        from (
          select id, sender_id, sender_name, sender_role, body, created_at
            from drv_booking_messages
           where booking_key = p_booking_key
        ) m
    )
  );
end;
$$;

revoke all on function drv_get_messages(text, text, bigint) from public;
grant execute on function drv_get_messages(text, text, bigint) to anon, authenticated;
