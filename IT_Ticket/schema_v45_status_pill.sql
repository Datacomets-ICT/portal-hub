-- Migration v45 — Status Pill (Slack-style status emoji + text)
--
-- Adds a per-user status that appears next to their avatar across the
-- portal. Users set it from their profile menu; it auto-clears at the
-- chosen expiry. Three columns + two RPCs:
--
--   employees.status_emoji   text
--   employees.status_text    text
--   employees.status_until   timestamptz   -- null = never expires
--
-- RPCs:
--   set_my_status(p_emp_id, p_password, p_emoji, p_text, p_minutes)
--   clear_my_status(p_emp_id, p_password)
--
-- Auth: each user can only set their OWN status (verified via password
-- match). Admins can override via the existing admin RPCs if needed.
--
-- Idempotent — safe to re-run.

-- ============================================================================
-- 1. Columns
-- ============================================================================
alter table public.employees
  add column if not exists status_emoji text,
  add column if not exists status_text  text,
  add column if not exists status_until timestamptz;


-- ============================================================================
-- 2. RPC: set_my_status — user sets their own status
-- ============================================================================
-- Verified by password (same pattern as login). Pass empty string for
-- emoji/text to clear; minutes=0/null = no expiry.
create or replace function public.set_my_status(
  p_emp_id    text,
  p_password  text,
  p_emoji     text default null,
  p_text      text default null,
  p_minutes   int default 240         -- default: clears after 4 hours
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp_pwd text;
  expires timestamptz;
begin
  select password into emp_pwd from employees where employee_id = p_emp_id;
  if not found or emp_pwd is distinct from p_password then
    raise exception 'unauthorized';
  end if;

  if p_minutes is null or p_minutes <= 0 then
    expires := null;
  else
    expires := now() + (p_minutes || ' minutes')::interval;
  end if;

  update employees
     set status_emoji = nullif(coalesce(p_emoji, ''), ''),
         status_text  = nullif(coalesce(p_text,  ''), ''),
         status_until = case
           when nullif(coalesce(p_emoji, ''), '') is null
            and nullif(coalesce(p_text,  ''), '') is null
           then null
           else expires
         end
   where employee_id = p_emp_id;
end;
$body$;
revoke all on function public.set_my_status(text, text, text, text, int) from public;
grant execute on function public.set_my_status(text, text, text, text, int)
  to anon, authenticated;


-- ============================================================================
-- 3. RPC: clear_my_status — convenience wrapper
-- ============================================================================
create or replace function public.clear_my_status(p_emp_id text, p_password text)
returns void
language sql
security definer
set search_path = public
as $body$
  select set_my_status(p_emp_id, p_password, null, null, 0);
$body$;
revoke all on function public.clear_my_status(text, text) from public;
grant execute on function public.clear_my_status(text, text) to anon, authenticated;


-- ============================================================================
-- 4. RPC: get_status — read someone's status (anyone can read anyone's)
-- ============================================================================
-- Returns nulls if the status has expired. Cheap enough that the front-end
-- can poll for the current user every minute or two.
create or replace function public.get_status(p_emp_id text)
returns json
language sql
security definer
set search_path = public
as $body$
  select json_build_object(
    'emoji', case when status_until is null or status_until > now() then status_emoji else null end,
    'text',  case when status_until is null or status_until > now() then status_text  else null end,
    'until', case when status_until is null or status_until > now() then status_until else null end
  )
  from employees
  where employee_id = p_emp_id;
$body$;
revoke all on function public.get_status(text) from public;
grant execute on function public.get_status(text) to anon, authenticated;


-- ============================================================================
-- 5. Update login() to return status fields too
-- ============================================================================
-- So the portal sees the user's status immediately on login without an
-- extra round-trip. Mirrors the v43 update pattern.
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
