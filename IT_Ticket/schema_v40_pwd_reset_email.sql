-- Migration v40 — add contact email to password reset requests
--
-- Old flow: user submits employee_id + note; IT gets a notification with
-- only their name. IT had no way to reach the user back.
-- New flow: user submits employee_id + email; the notification includes
-- the email so IT can just click → mailto: → reply.
--
-- Run once in Supabase SQL Editor on the Datacomets project.

-- 1. Add email column (idempotent)
alter table public.password_reset_requests
  add column if not exists contact_email text;

-- 2. Update the user-facing RPC to accept p_email
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

  -- Notify System-role users — message format the existing pwdResetPopup
  -- already parses: "<empId> — <name> | <company> | เหตุผล: <note> | อีเมล: <email>"
  insert into notifications(employee_id, ticket_no, title, message)
  select e.employee_id,
         '',
         'คำขอรีเซ็ตรหัสผ่าน',
         p_emp_id || ' — ' || fullname
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

-- Drop the old 2-arg signature so callers using positional args don't ambiguate
drop function if exists request_password_reset(text, text);

grant execute on function request_password_reset(text, text, text) to anon, authenticated;
