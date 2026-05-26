-- Migration v49 — Directory shows only "in_directory" employees
--
-- Background: employees table has ~800 accumulated rows. Each month
-- HR sends an Excel of ~269 active contacts. We want the Directory
-- page (/people) to show only the people in this month's list.
--
-- Approach: a boolean flag `in_directory`. The monthly contact import
-- (scripts/generate_contact_updates.py + scripts/contact_updates.sql)
-- resets everyone to false, then flips true for matched rows. The RPC
-- below filters by it. Employees not in the Excel can still log in —
-- they just don't appear in the directory.
--
-- Idempotent.

alter table employees
  add column if not exists in_directory boolean default false;

create or replace function public.list_active_employees()
returns table (
  employee_id    text,
  first_name     text,
  last_name      text,
  nickname       text,
  email          text,
  phone          text,
  line_id        text,
  department     text,
  section        text,
  job_position   text,
  company        text,
  avatar_url     text,
  status_emoji   text,
  status_text    text,
  status_until   timestamptz
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
    e.email,
    e.phone,
    e.line_id,
    e.department,
    e.section,
    e.position    as job_position,
    e.company,
    e.avatar_url,
    case when e.status_until is null or e.status_until > now() then e.status_emoji else null end,
    case when e.status_until is null or e.status_until > now() then e.status_text  else null end,
    case when e.status_until is null or e.status_until > now() then e.status_until else null end
  from employees e
  where coalesce(e.is_approved, true) = true
    and e.resigned_date is null
    and coalesce(e.in_directory, false) = true
  order by
    e.first_name nulls last,
    e.last_name  nulls last,
    e.employee_id;
$body$;

revoke all on function public.list_active_employees() from public;
grant execute on function public.list_active_employees() to anon, authenticated;
