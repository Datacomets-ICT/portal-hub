-- Migration v52 — LINE ID round-trip fix
--
-- User reported: saving LINE ID in the profile modal doesn't stick.
-- Root cause: v45_status_pill.sql redefined the login() RPC and dropped
-- the lineId field from the returned JSON. update_my_profile DOES write
-- employees.line_id, but on next login the frontend never gets it back,
-- so user.lineId stays empty and the modal always shows blank.
--
-- v42 had the right shape but was overwritten by v45. This file restores
-- lineId in the login() payload AND re-asserts the 6-arg update_my_profile
-- (dropping the legacy 5-arg overload so PostgREST can't resolve to the
-- one that silently ignores p_line_id).
--
-- Idempotent — safe to re-run.

-- ===== 1. Ensure columns exist (defensive) =====
alter table public.employees add column if not exists line_id text;

-- ===== 2. Drop the legacy 5-arg update_my_profile so the 6-arg wins =====
drop function if exists public.update_my_profile(text, text, text, text, text);

-- ===== 3. Recreate the canonical 6-arg update_my_profile =====
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

-- ===== 4. Restore lineId in login() payload =====
-- v45 redefined login() without lineId, breaking the round-trip even
-- though update_my_profile was writing it correctly. This re-defines
-- login() to be a strict superset of v45 (status + per-app roles +
-- isAdmin) PLUS lineId, so nothing else regresses.
create or replace function public.login(p_emp_id text, p_password text)
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp employees%rowtype;
  status_active boolean;
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

  status_active := emp.status_until is null or emp.status_until > now();

  return json_build_object(
    'success', true,
    'user', json_build_object(
      'employeeId',  emp.employee_id,
      'company',     coalesce(emp.company, ''),
      'firstName',   coalesce(emp.first_name, ''),
      'lastName',    coalesce(emp.last_name, ''),
      'department',  coalesce(emp.department, ''),
      'section',     coalesce(emp.section, ''),
      'position',    coalesce(emp.position, ''),
      'nickname',    coalesce(emp.nickname, ''),
      'email',       coalesce(emp.email, ''),
      'phone',       coalesce(emp.phone, ''),
      'lineId',      coalesce(emp.line_id, ''),
      'avatarUrl',   coalesce(emp.avatar_url, ''),
      'role',        coalesce(emp.role, 'user'),
      'isAdmin',     coalesce(emp.is_admin, false),
      'itRole',      coalesce(emp.it_role, 'user'),
      'driverRole',  coalesce(emp.driver_role, 'user'),
      'meetingRole', coalesce(emp.meeting_role, 'user'),
      'statusEmoji', case when status_active then emp.status_emoji else null end,
      'statusText',  case when status_active then emp.status_text  else null end,
      'statusUntil', case when status_active then emp.status_until else null end
    )
  );
end;
$body$;

revoke all on function public.login(text, text) from public;
grant execute on function public.login(text, text) to anon, authenticated;

-- ===== 5. Smoke check =====
select employee_id, nickname, line_id, avatar_url
  from public.employees
 where employee_id = '11295';
