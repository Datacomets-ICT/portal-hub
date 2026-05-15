-- Migration v46 — Employee Directory
--
-- Adds one RPC that returns active employees (not resigned, approved)
-- with the fields the directory page needs: identity, contact, role,
-- and current status. Reads-only, called by every signed-in user.
--
-- The directory mirrors the live `employees` table — there's nothing
-- separate to keep in sync. Update profile → directory reflects on
-- next page load.
--
-- Idempotent.

create or replace function public.list_active_employees()
returns table (
  employee_id   text,
  first_name    text,
  last_name     text,
  nickname      text,
  email         text,
  phone         text,
  line_id       text,
  department    text,
  section       text,
  position      text,
  company       text,
  avatar_url    text,
  status_emoji  text,
  status_text   text,
  status_until  timestamptz
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
    e.position,
    e.company,
    e.avatar_url,
    -- Hide expired statuses so the UI doesn't show stale "พักเที่ยง"
    -- from yesterday lunch.
    case when e.status_until is null or e.status_until > now() then e.status_emoji else null end,
    case when e.status_until is null or e.status_until > now() then e.status_text  else null end,
    case when e.status_until is null or e.status_until > now() then e.status_until else null end
  from employees e
  where coalesce(e.is_approved, true) = true
    and e.resigned_date is null
  order by
    e.first_name nulls last,
    e.last_name  nulls last,
    e.employee_id;
$body$;

revoke all on function public.list_active_employees() from public;
grant execute on function public.list_active_employees() to anon, authenticated;
