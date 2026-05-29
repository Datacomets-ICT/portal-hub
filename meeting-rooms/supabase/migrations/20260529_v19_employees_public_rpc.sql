-- Migration v19 · 2026-05-29
-- RPC: list_employees_public — anon-readable directory of ALL employees
--
-- Background: `employees` has restrictive RLS (no policies → anon denied)
-- because of the `password` column. The existing `list_active_employees`
-- RPC works for the IT directory page but filters by `in_directory=true`
-- which leaves out resigned staff, contractors, and people HR hasn't tagged
-- yet. Meeting-rooms needs to resolve any booker name (including legacy
-- CSV-imported ones from people no longer active) to show nickname/
-- position next to old bookings.
--
-- This RPC returns the full roster with only safe columns (no password).

-- Note: `position` is a reserved word in SQL — quote it in the RETURNS TABLE
-- definition. (Inside the body it's fine because it's prefixed by `e.`.)
create or replace function public.list_employees_public()
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
  phone        text
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
    e.phone
  from employees e
  order by e.first_name nulls last, e.last_name nulls last;
$body$;

revoke all on function public.list_employees_public() from public;
grant execute on function public.list_employees_public() to anon, authenticated;
