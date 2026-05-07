-- Migration v43 — per-app roles (it / driver / meeting)
--
-- Goal: same employee can be admin in IT-Ticket but regular user in
-- Driver/Meeting (and any other combination). Adds three role columns
-- on `employees`, backfills from the legacy `is_admin` flag, and
-- updates the `login` RPC to return them.
--
-- Idempotent — safe to re-run.

-- ===== 1. Add per-app role columns =====
alter table public.employees
  add column if not exists it_role      text default 'user',
  add column if not exists driver_role  text default 'user',
  add column if not exists meeting_role text default 'user';

-- ===== 2. Backfill from legacy is_admin =====
-- One-time copy of the global is_admin flag to each per-app role so
-- existing admins keep their access. Only updates rows that haven't
-- been customized yet (still the default 'user').
update public.employees
   set it_role = case when is_admin then 'admin' else 'user' end
 where it_role is null or it_role = 'user';

update public.employees
   set driver_role = case when is_admin then 'admin' else 'user' end
 where driver_role is null or driver_role = 'user';

update public.employees
   set meeting_role = case when is_admin then 'admin' else 'user' end
 where meeting_role is null or meeting_role = 'user';

-- ===== 3. Update login RPC to return the new role fields =====
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
  -- Legacy global isAdmin: true if explicitly admin OR has elevated role.
  -- Each sub-app now also reads its own *_role column for finer control.
  is_adm := coalesce(emp.is_admin, false)
         or coalesce(emp.role, 'user') in ('manager', 'senior_manager', 'officer', 'system');

  return json_build_object(
    'success', true,
    'user', json_build_object(
      'employeeId',  emp.employee_id,
      'firstName',   coalesce(emp.first_name, ''),
      'lastName',    coalesce(emp.last_name, ''),
      'fullName',    full_name,
      'nickname',    coalesce(emp.nickname, ''),
      'company',     coalesce(emp.company, ''),
      'department',  coalesce(emp.department, ''),
      'section',     coalesce(emp.section, ''),
      'position',    coalesce(emp.position, ''),
      'email',       coalesce(emp.email, ''),
      'phone',       coalesce(emp.phone, ''),
      'lineId',      coalesce(emp.line_id, ''),
      'avatarUrl',   coalesce(emp.avatar_url, ''),
      'role',        coalesce(emp.role, 'user'),
      'isAdmin',     is_adm,
      'itRole',      coalesce(emp.it_role,      'user'),
      'driverRole',  coalesce(emp.driver_role,  'user'),
      'meetingRole', coalesce(emp.meeting_role, 'user')
    )
  );
end;
$body$;

grant execute on function public.login(text, text) to anon, authenticated;

-- ===== 4. Smoke check =====
select employee_id, nickname,
       it_role, driver_role, meeting_role, is_admin, role
  from public.employees
 where employee_id in ('11295', '10001')
 order by employee_id;
