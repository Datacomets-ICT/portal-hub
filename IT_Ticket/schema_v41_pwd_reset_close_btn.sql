-- Migration v41 — let IT close password-reset requests from the popup
--
-- v40 added contact_email to notifications. Now the popup also needs to
-- mark a request as "done" so the user can submit a fresh request later.
-- We embed the request id into the notification message so the frontend
-- can pull it out without an extra round-trip.
--
-- Run once in Supabase SQL Editor on the Datacomets project.

-- ===== 1. Re-create request_password_reset to prepend [id:N] tag =====
create or replace function request_password_reset(
  p_emp_id text,
  p_email  text default null,
  p_note   text default null
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp employees%rowtype;
  new_req_id bigint;
  fullname text;
begin
  select * into emp from employees where employee_id = p_emp_id;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่พบรหัสพนักงานในระบบ');
  end if;

  if exists (select 1 from password_reset_requests
             where employee_id = p_emp_id and status = 'pending') then
    return json_build_object('success', false,
      'message', 'มีคำขอรีเซ็ตรหัสผ่านของคุณค้างอยู่แล้ว รอเจ้าหน้าที่ดำเนินการ');
  end if;

  fullname := trim(coalesce(emp.first_name, '') || ' ' || coalesce(emp.last_name, ''));

  insert into password_reset_requests(employee_id, requester_name, note, contact_email)
  values (p_emp_id, fullname, p_note, p_email)
  returning id into new_req_id;

  -- Notification format the v41 pwdResetPopup parses:
  --   "[id:42] 11295 — ธนบดี เหลาทอง | Comets | เหตุผล: ... | อีเมล: u@x.com"
  insert into notifications(employee_id, ticket_no, title, message)
  select e.employee_id,
         '',
         'คำขอรีเซ็ตรหัสผ่าน',
         '[id:' || new_req_id || '] '
         || p_emp_id || ' — ' || fullname
         || ' | ' || coalesce(emp.company, '-')
         || case when p_note  is null or p_note  = '' then '' else ' | เหตุผล: ' || p_note end
         || case when p_email is null or p_email = '' then '' else ' | อีเมล: ' || p_email end
    from employees e
   where e.role = 'system';

  return json_build_object('success', true,
    'message', 'ส่งคำขอรีเซ็ตรหัสผ่านแล้ว เจ้าหน้าที่จะติดต่อกลับทางอีเมล',
    'requestId', new_req_id);
end;
$body$;

grant execute on function request_password_reset(text, text, text) to anon, authenticated;

-- ===== 2. Lightweight "close" RPC =====
-- The existing resolve_password_reset(...) is overkill for the new flow:
-- it requires a new password and notifies the user. After IT replies via
-- email and resets the password manually, they just want to close the
-- request without changing anything else. This RPC does exactly that.
create or replace function close_password_reset(
  p_emp_id     text,
  p_password   text,
  p_request_id bigint
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp employees%rowtype;
  req password_reset_requests%rowtype;
begin
  select * into emp from employees where employee_id = p_emp_id and password = p_password;
  if not found or coalesce(emp.role, 'user') <> 'system' then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์');
  end if;

  select * into req from password_reset_requests where id = p_request_id;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่พบคำขอ');
  end if;
  if req.status <> 'pending' then
    return json_build_object('success', false, 'message', 'คำขอนี้ถูกปิดไปแล้ว');
  end if;

  update password_reset_requests
     set status = 'approved', resolved_by = p_emp_id, resolved_at = now()
   where id = p_request_id;

  return json_build_object('success', true, 'message', 'ปิดคำขอเรียบร้อย');
end;
$body$;

grant execute on function close_password_reset(text, text, bigint) to anon, authenticated;

-- ===== 3. Backfill: clear stuck pending requests from before v41 =====
-- Old pending requests have no contact_email (or no [id:N] in their
-- notification message). Mark them resolved so users aren't blocked from
-- submitting fresh requests under the new flow. Audit row stays in DB.
update password_reset_requests
   set status = 'approved',
       resolved_by = 'system-v41-backfill',
       resolved_at = now()
 where status = 'pending'
   and contact_email is null;
