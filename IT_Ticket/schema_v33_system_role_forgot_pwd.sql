-- ============================================================
-- Phase 33: Add 'system' role + password reset request flow
--   11295 = System admin (ผม เติ้ล)
-- ============================================================

-- ========== 1) อัปเดต role check constraint ==========
alter table employees drop constraint if exists employees_role_check;
alter table employees add constraint employees_role_check
  check (role in ('manager','senior_manager','officer','user','system'));

-- ========== 2) ตั้ง System role ให้ 11295 ==========
update employees
   set role          = 'system',
       scope_company = null,
       is_admin      = true,
       is_approved   = true,
       resigned_date = null
 where employee_id = '11295';

-- ========== 3) สร้างตาราง password reset requests ==========
create table if not exists password_reset_requests (
  id            bigserial primary key,
  employee_id   text not null,
  requester_name text,
  note          text,
  status        text not null default 'pending'
                check (status in ('pending','approved','rejected')),
  new_password  text,
  requested_at  timestamptz not null default now(),
  resolved_by   text,
  resolved_at   timestamptz
);

create index if not exists idx_pwd_reset_status on password_reset_requests(status);
create index if not exists idx_pwd_reset_emp on password_reset_requests(employee_id);

-- ========== 4) RPC: user ขอ reset password ==========
create or replace function request_password_reset(
  p_emp_id text,
  p_note   text default null
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp employees%rowtype;
  new_req_id bigint;
begin
  -- ตรวจว่ามีรหัสพนักงานนี้ในระบบ
  select * into emp from employees where employee_id = p_emp_id;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่พบรหัสพนักงานในระบบ');
  end if;

  -- ถ้ามี request ค้างอยู่ไม่ซ้ำซ้อน
  if exists (select 1 from password_reset_requests
             where employee_id = p_emp_id and status = 'pending') then
    return json_build_object('success', false,
      'message', 'มีคำขอรีเซ็ตรหัสผ่านของคุณค้างอยู่แล้ว รอเจ้าหน้าที่ดำเนินการ');
  end if;

  insert into password_reset_requests(employee_id, requester_name, note)
  values (p_emp_id,
          trim(coalesce(emp.first_name,'') || ' ' || coalesce(emp.last_name,'')),
          p_note)
  returning id into new_req_id;

  -- Notify System role (11295 เติ้ล + คนอื่นในอนาคต)
  insert into notifications(employee_id, ticket_no, title, message)
  select e.employee_id,
         '',
         'คำขอรีเซ็ตรหัสผ่าน',
         p_emp_id || ' — ' ||
         coalesce(emp.first_name,'') || ' ' || coalesce(emp.last_name,'') ||
         case when p_note is null or p_note = '' then '' else ' | ' || p_note end
    from employees e
   where e.role = 'system';

  return json_build_object('success', true,
    'message', 'ส่งคำขอรีเซ็ตรหัสผ่านแล้ว เจ้าหน้าที่จะติดต่อกลับ',
    'requestId', new_req_id);
end;
$body$;

grant execute on function request_password_reset(text, text) to anon, authenticated;

-- ========== 5) RPC: ดู pending requests (System role เท่านั้น) ==========
create or replace function list_password_reset_requests(
  p_emp_id   text,
  p_password text,
  p_status   text default 'pending'
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp employees%rowtype;
begin
  select * into emp from employees where employee_id = p_emp_id and password = p_password;
  if not found or coalesce(emp.role,'user') <> 'system' then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์');
  end if;

  return json_build_object('success', true, 'requests', coalesce((
    select json_agg(row_to_json(x) order by x.requested_at desc)
    from (
      select r.id, r.employee_id as "employeeId", r.requester_name as "requesterName",
             r.note, r.status,
             r.requested_at as "requestedAt",
             r.resolved_by as "resolvedBy",
             r.resolved_at as "resolvedAt"
      from password_reset_requests r
      where (p_status is null or p_status = '' or r.status = p_status)
      limit 100
    ) x
  ), '[]'::json));
end;
$body$;

grant execute on function list_password_reset_requests(text, text, text) to anon, authenticated;

-- ========== 6) RPC: resolve request (System role) ==========
create or replace function resolve_password_reset(
  p_emp_id       text,
  p_password     text,
  p_request_id   bigint,
  p_new_password text,
  p_action       text default 'approve'  -- 'approve' or 'reject'
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
  if not found or coalesce(emp.role,'user') <> 'system' then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์');
  end if;

  select * into req from password_reset_requests where id = p_request_id;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่พบคำขอ');
  end if;
  if req.status <> 'pending' then
    return json_build_object('success', false, 'message', 'คำขอนี้ถูกดำเนินการไปแล้ว');
  end if;

  if p_action = 'approve' then
    if p_new_password is null or length(trim(p_new_password)) < 3 then
      return json_build_object('success', false, 'message', 'รหัสผ่านใหม่ต้องมีอย่างน้อย 3 ตัว');
    end if;
    update employees set password = p_new_password where employee_id = req.employee_id;
    update password_reset_requests
       set status = 'approved', new_password = p_new_password,
           resolved_by = p_emp_id, resolved_at = now()
     where id = p_request_id;

    -- แจ้ง user
    insert into notifications(employee_id, ticket_no, title, message)
    values (req.employee_id, '', 'รหัสผ่านใหม่',
            'รหัสผ่านของคุณถูกรีเซ็ตแล้ว ติดต่อเจ้าหน้าที่ System เพื่อรับรหัสใหม่');
  else
    update password_reset_requests
       set status = 'rejected', resolved_by = p_emp_id, resolved_at = now()
     where id = p_request_id;
  end if;

  return json_build_object('success', true);
end;
$body$;

grant execute on function resolve_password_reset(text, text, bigint, text, text) to anon, authenticated;

-- ========== 7) ทดสอบ ==========
select employee_id, nickname, role, scope_company, is_admin
  from employees
 where role in ('manager','senior_manager','officer','system')
 order by
   case role when 'manager' then 1 when 'senior_manager' then 2 when 'officer' then 3 when 'system' then 4 end;
