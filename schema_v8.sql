-- ============================================================
-- Phase 8: Registration + Admin approval + active/resigned filter
-- ============================================================

-- Add columns for registration approval + resigned tracking
alter table employees add column if not exists is_approved boolean not null default true;
alter table employees add column if not exists resigned_date date;
alter table employees add column if not exists registered_at timestamptz;

-- Existing employees are already approved
update employees set is_approved = true where is_approved is null;

-- ===== Updated login() — block resigned + unapproved =====

create or replace function login(p_emp_id text, p_password text)
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp employees%rowtype;
begin
  select * into emp
  from employees
  where employee_id = p_emp_id
    and password    = p_password;

  if not found then
    return json_build_object(
      'success', false,
      'message', 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง'
    );
  end if;

  -- Block resigned employees
  if emp.resigned_date is not null then
    return json_build_object(
      'success', false,
      'message', 'บัญชีนี้ถูกปิดการใช้งานแล้ว กรุณาติดต่อฝ่าย IT'
    );
  end if;

  -- Block unapproved registrations
  if not coalesce(emp.is_approved, false) then
    return json_build_object(
      'success', false,
      'message', 'บัญชีของคุณยังรอการอนุมัติจากทีม IT กรุณารอสักครู่'
    );
  end if;

  return json_build_object(
    'success', true,
    'user', json_build_object(
      'employeeId', emp.employee_id,
      'company',    coalesce(emp.company, ''),
      'firstName',  coalesce(emp.first_name, ''),
      'lastName',   coalesce(emp.last_name, ''),
      'department', coalesce(emp.department, ''),
      'section',    coalesce(emp.section, ''),
      'position',   coalesce(emp.position, ''),
      'nickname',   coalesce(emp.nickname, ''),
      'email',      coalesce(emp.email, ''),
      'phone',      coalesce(emp.phone, ''),
      'isAdmin',    coalesce(emp.is_admin, false)
    )
  );
end;
$body$;

revoke all on function login(text, text) from public;
grant execute on function login(text, text) to anon, authenticated;

-- ===== RPC: register new employee =====

create or replace function register_employee(
  p_emp_id     text,
  p_password   text,
  p_company    text,
  p_first_name text,
  p_last_name  text,
  p_nickname   text,
  p_position   text,
  p_email      text,
  p_phone      text
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  existing employees%rowtype;
begin
  -- Check if employee_id already exists
  select * into existing from employees where employee_id = p_emp_id;
  if found then
    return json_build_object('success', false, 'message', 'รหัสพนักงานนี้มีอยู่ในระบบแล้ว');
  end if;

  insert into employees (
    employee_id, password, company, first_name, last_name,
    nickname, position, email, phone, is_admin, is_approved, registered_at
  ) values (
    p_emp_id, p_password, p_company, p_first_name, p_last_name,
    p_nickname, p_position, p_email, p_phone, false, false, now()
  );

  -- Notify all admins about the new registration
  insert into notifications (employee_id, ticket_no, title, message)
  select employee_id, '',
         'มีพนักงานใหม่ลงทะเบียน',
         p_emp_id || ' — ' || coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, '') || ' (' || coalesce(p_company, '') || ') รออนุมัติ'
  from employees
  where is_admin = true and coalesce(is_approved, true) = true;

  return json_build_object('success', true, 'message', 'ลงทะเบียนสำเร็จ กรุณารอการอนุมัติจากทีม IT');
end;
$body$;

revoke all on function register_employee(text,text,text,text,text,text,text,text,text) from public;
grant execute on function register_employee(text,text,text,text,text,text,text,text,text) to anon, authenticated;

-- ===== RPC: get pending registrations (admin) =====

create or replace function get_pending_registrations()
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  result json;
begin
  select json_agg(row_to_json(t) order by t.registered_at desc) into result
  from (
    select
      employee_id as "employeeId",
      coalesce(first_name, '') as "firstName",
      coalesce(last_name, '') as "lastName",
      coalesce(nickname, '') as "nickname",
      coalesce(company, '') as "company",
      coalesce(position, '') as "position",
      coalesce(email, '') as "email",
      coalesce(phone, '') as "phone",
      registered_at as "registeredAt"
    from employees
    where is_approved = false
      and resigned_date is null
    order by registered_at desc
  ) t;

  return coalesce(result, '[]'::json);
end;
$body$;

revoke all on function get_pending_registrations() from public;
grant execute on function get_pending_registrations() to anon, authenticated;

-- ===== RPC: approve or reject registration (admin) =====

create or replace function approve_registration(
  p_admin_id   text,
  p_admin_pwd  text,
  p_emp_id     text,
  p_action     text  -- 'approve' or 'reject'
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  is_adm boolean;
begin
  select is_admin into is_adm
  from employees
  where employee_id = p_admin_id and password = p_admin_pwd;

  if not coalesce(is_adm, false) then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์ admin');
  end if;

  if p_action = 'approve' then
    update employees set is_approved = true where employee_id = p_emp_id and is_approved = false;
  elsif p_action = 'reject' then
    delete from employees where employee_id = p_emp_id and is_approved = false;
  end if;

  return json_build_object('success', true);
end;
$body$;

revoke all on function approve_registration(text,text,text,text) from public;
grant execute on function approve_registration(text,text,text,text) to anon, authenticated;
