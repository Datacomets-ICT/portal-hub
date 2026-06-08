-- Migration v51 · 2026-06-08
-- Fix: get_user_apps was hard-coded to always include 'repair' (from when
-- repair was free-for-all coming-soon). Now that repair_role exists (v50),
-- gate it the same way as the other apps.

create or replace function public.get_user_apps(p_emp_id text)
returns text[]
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp employees%rowtype;
  apps text[] := array[]::text[];
begin
  select * into emp from employees where employee_id = p_emp_id;
  if not found then
    return apps;
  end if;
  if coalesce(emp.it_role,      'user') <> 'none' then apps := array_append(apps, 'it'); end if;
  if coalesce(emp.driver_role,  'user') <> 'none' then apps := array_append(apps, 'driver'); end if;
  if coalesce(emp.meeting_role, 'user') <> 'none' then apps := array_append(apps, 'meeting'); end if;
  if coalesce(emp.repair_role,  'user') <> 'none' then apps := array_append(apps, 'repair'); end if;
  return apps;
end;
$body$;
