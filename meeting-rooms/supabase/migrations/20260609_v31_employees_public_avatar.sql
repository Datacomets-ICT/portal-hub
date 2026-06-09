-- Migration v31 · 2026-06-09
-- Add avatar_url to list_employees_public so the AttendeePicker can show
-- profile photos in its search dropdown.

drop function if exists public.list_employees_public();

create function public.list_employees_public()
returns table (
  employee_id  text,
  first_name   text,
  last_name    text,
  nickname     text,
  department   text,
  section      text,
  "position"   text,
  company      text,
  email        text,
  phone        text,
  avatar_url   text
)
language sql
security definer
set search_path = public
as $body$
  select
    e.employee_id,
    e.first_name,
    e.last_name,
    e.nickname,
    e.department,
    e.section,
    e.position,
    e.company,
    e.email,
    e.phone,
    e.avatar_url
  from employees e
  order by e.first_name nulls last, e.last_name nulls last;
$body$;

revoke all on function public.list_employees_public() from public;
grant execute on function public.list_employees_public() to anon, authenticated;
