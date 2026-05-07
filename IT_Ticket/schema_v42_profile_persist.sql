-- Migration v42 — make sure profile fields actually persist
--
-- User reported LINE ID + avatar updates don't stick across sessions.
-- Root cause: two `update_my_profile` overloads (5-arg vs 6-arg) coexist
-- after migration_3, and PostgREST sometimes resolves to the older
-- 5-arg version which silently drops p_line_id. Same risk for avatar
-- if migration_2 wasn't applied. This file is idempotent — safe to run
-- on top of any prior schema state.

-- ===== 1. Ensure columns exist =====
alter table public.employees add column if not exists avatar_url text;
alter table public.employees add column if not exists line_id    text;

-- ===== 2. Drop the old 5-arg update_my_profile so the 6-arg wins =====
drop function if exists public.update_my_profile(text, text, text, text, text);

-- ===== 3. Recreate the 6-arg version (canonical) =====
create or replace function public.update_my_profile(
  p_emp_id    text,
  p_password  text,
  p_nickname  text,
  p_email     text,
  p_phone     text,
  p_line_id   text default null
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
    return json_build_object('success', false, 'message', 'รหัสผ่านไม่ถูกต้อง');
  end if;

  update employees set
    nickname = nullif(trim(coalesce(p_nickname, '')), ''),
    email    = nullif(trim(coalesce(p_email,    '')), ''),
    phone    = nullif(trim(coalesce(p_phone,    '')), ''),
    line_id  = nullif(trim(coalesce(p_line_id,  '')), '')
  where employee_id = p_emp_id;

  return json_build_object('success', true);
end;
$body$;

revoke all  on function public.update_my_profile(text, text, text, text, text, text) from public;
grant execute on function public.update_my_profile(text, text, text, text, text, text) to anon, authenticated;

-- ===== 4. Make sure login returns avatarUrl + lineId so the freshly-saved
-- values are actually visible to the frontend after re-login =====
create or replace function public.login(p_emp_id text, p_password text)
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp employees%rowtype;
  full_name text;
  is_adm boolean;
begin
  select * into emp from employees
   where employee_id = p_emp_id and password = p_password;
  if not found then
    return json_build_object('success', false, 'message', 'รหัสผ่านไม่ถูกต้อง');
  end if;

  if not coalesce(emp.is_approved, true) then
    return json_build_object('success', false, 'message', 'บัญชีของคุณยังไม่ได้รับการอนุมัติจากผู้ดูแลระบบ');
  end if;

  full_name := trim(coalesce(emp.first_name, '') || ' ' || coalesce(emp.last_name, ''));
  is_adm := coalesce(emp.is_admin, false)
         or coalesce(emp.role, 'user') in ('manager', 'senior_manager', 'officer', 'system');

  return json_build_object(
    'success', true,
    'user', json_build_object(
      'employeeId', emp.employee_id,
      'firstName',  coalesce(emp.first_name, ''),
      'lastName',   coalesce(emp.last_name, ''),
      'fullName',   full_name,
      'nickname',   coalesce(emp.nickname, ''),
      'company',    coalesce(emp.company, ''),
      'department', coalesce(emp.department, ''),
      'section',    coalesce(emp.section, ''),
      'position',   coalesce(emp.position, ''),
      'email',      coalesce(emp.email, ''),
      'phone',      coalesce(emp.phone, ''),
      'lineId',     coalesce(emp.line_id, ''),
      'avatarUrl',  coalesce(emp.avatar_url, ''),
      'role',       coalesce(emp.role, 'user'),
      'isAdmin',    is_adm
    )
  );
end;
$body$;

grant execute on function public.login(text, text) to anon, authenticated;

-- ===== 5. Quick smoke check (returns the row for visual verification) =====
select employee_id, nickname, line_id, avatar_url
  from public.employees
 where employee_id = '11295';
