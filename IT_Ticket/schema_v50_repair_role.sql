-- Migration v50 · 2026-06-08
-- Add `repair_role` column + extend admin_list_employees / admin_set_user_role
-- so the admin page can control Repair Service access alongside IT / Driver / Meeting.

alter table public.employees
  add column if not exists repair_role text default 'user';

alter table public.employees drop constraint if exists employees_repair_role_check;
alter table public.employees add constraint employees_repair_role_check
  check (repair_role = any (array['none', 'user', 'admin']));

-- Drop & recreate (return type changed — Postgres refuses CREATE OR REPLACE here)
drop function if exists public.admin_list_employees(text);

create function public.admin_list_employees(p_admin_id text)
returns table (
  employee_id   text,
  first_name    text,
  last_name     text,
  nickname      text,
  email         text,
  department    text,
  section       text,
  is_approved   boolean,
  it_role       text,
  driver_role   text,
  meeting_role  text,
  repair_role   text,
  resigned_date date,
  registered_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $body$
begin
  if not is_system_admin(p_admin_id) then
    raise exception 'unauthorized -- admin only';
  end if;

  return query
    select
      e.employee_id,
      e.first_name,
      e.last_name,
      e.nickname,
      e.email,
      e.department,
      e.section,
      coalesce(e.is_approved, true)   as is_approved,
      coalesce(e.it_role,      'user') as it_role,
      coalesce(e.driver_role,  'user') as driver_role,
      coalesce(e.meeting_role, 'user') as meeting_role,
      coalesce(e.repair_role,  'user') as repair_role,
      e.resigned_date,
      e.registered_at
    from employees e
    order by
      coalesce(e.is_approved, true) asc,
      e.employee_id;
end;
$body$;
revoke all on function public.admin_list_employees(text) from public;
grant execute on function public.admin_list_employees(text) to anon, authenticated;


create or replace function public.admin_set_user_role(
  p_admin_id  text,
  p_target_id text,
  p_app       text,    -- 'it' | 'driver' | 'meeting' | 'repair'
  p_role      text     -- 'none' | 'user' | 'admin'
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
begin
  if not is_system_admin(p_admin_id) then
    raise exception 'unauthorized -- admin only';
  end if;
  if p_app not in ('it', 'driver', 'meeting', 'repair') then
    raise exception 'invalid app: %', p_app;
  end if;
  if p_role not in ('none', 'user', 'admin') then
    raise exception 'invalid role: %', p_role;
  end if;

  if p_app = 'it' then
    update employees set it_role = p_role where employee_id = p_target_id;
  elsif p_app = 'driver' then
    update employees set driver_role = p_role where employee_id = p_target_id;
  elsif p_app = 'meeting' then
    update employees set meeting_role = p_role where employee_id = p_target_id;
  elsif p_app = 'repair' then
    update employees set repair_role = p_role where employee_id = p_target_id;
  end if;
end;
$body$;
revoke all on function public.admin_set_user_role(text, text, text, text) from public;
grant execute on function public.admin_set_user_role(text, text, text, text) to anon, authenticated;
