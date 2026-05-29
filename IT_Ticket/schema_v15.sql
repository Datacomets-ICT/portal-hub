-- ============================================================
-- Phase 15: User Profile — Avatar, edit personal info, change password
-- ============================================================

-- New column for avatar
alter table employees add column if not exists avatar_url text;

-- Updated login() to also return avatarUrl
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

  if emp.resigned_date is not null then
    return json_build_object(
      'success', false,
      'message', 'บัญชีนี้ถูกปิดการใช้งานแล้ว กรุณาติดต่อฝ่าย IT'
    );
  end if;

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
      'avatarUrl',  coalesce(emp.avatar_url, ''),
      'isAdmin',    coalesce(emp.is_admin, false)
    )
  );
end;
$body$;

grant execute on function login(text, text) to anon, authenticated;

-- ============================================================
-- RPC: update_my_profile — edit nickname / email / phone
-- ============================================================
create or replace function update_my_profile(
  p_emp_id    text,
  p_password  text,
  p_nickname  text,
  p_email     text,
  p_phone     text
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp employees%rowtype;
begin
  select * into emp from employees
  where employee_id = p_emp_id and password = p_password;
  if not found then
    return json_build_object('success', false, 'message', 'รหัสผ่านไม่ถูกต้อง');
  end if;

  update employees
  set
    nickname = nullif(trim(coalesce(p_nickname, '')), ''),
    email    = nullif(trim(coalesce(p_email, '')), ''),
    phone    = nullif(trim(coalesce(p_phone, '')), '')
  where employee_id = p_emp_id;

  return json_build_object(
    'success', true,
    'user', json_build_object(
      'nickname', coalesce(nullif(trim(coalesce(p_nickname, '')), ''), ''),
      'email',    coalesce(nullif(trim(coalesce(p_email, '')), ''), ''),
      'phone',    coalesce(nullif(trim(coalesce(p_phone, '')), ''), '')
    )
  );
end;
$body$;

revoke all on function update_my_profile(text, text, text, text, text) from public;
grant execute on function update_my_profile(text, text, text, text, text) to anon, authenticated;

-- ============================================================
-- RPC: change_my_password — verify old password first
-- ============================================================
create or replace function change_my_password(
  p_emp_id       text,
  p_old_password text,
  p_new_password text
) returns json
language plpgsql
security definer
set search_path = public
as $body$
begin
  if p_new_password is null or length(trim(p_new_password)) < 4 then
    return json_build_object('success', false, 'message', 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร');
  end if;

  if not exists (
    select 1 from employees
    where employee_id = p_emp_id and password = p_old_password
  ) then
    return json_build_object('success', false, 'message', 'รหัสผ่านเดิมไม่ถูกต้อง');
  end if;

  update employees
  set password = p_new_password
  where employee_id = p_emp_id;

  return json_build_object('success', true);
end;
$body$;

revoke all on function change_my_password(text, text, text) from public;
grant execute on function change_my_password(text, text, text) to anon, authenticated;

-- ============================================================
-- RPC: update_my_avatar — save avatar URL
-- ============================================================
create or replace function update_my_avatar(
  p_emp_id     text,
  p_password   text,
  p_avatar_url text
) returns json
language plpgsql
security definer
set search_path = public
as $body$
begin
  if not exists (
    select 1 from employees
    where employee_id = p_emp_id and password = p_password
  ) then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์');
  end if;

  update employees
  set avatar_url = nullif(trim(coalesce(p_avatar_url, '')), '')
  where employee_id = p_emp_id;

  return json_build_object('success', true);
end;
$body$;

revoke all on function update_my_avatar(text, text, text) from public;
grant execute on function update_my_avatar(text, text, text) to anon, authenticated;
