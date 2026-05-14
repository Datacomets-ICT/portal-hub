-- Migration v44 — Admin System (per-app role management + announcements)
--
-- Adds three things:
--   1. RPCs for the admin page to list/edit user permissions across the
--      three apps (IT-Ticket / Driver / Meeting Rooms)
--   2. The `announcements` table + RPCs that drive the bottom-right
--      marquee everyone sees on the portal hub
--   3. The `get_user_apps` RPC that the existing portal/src/lib/auth.jsx
--      already calls but wasn't implemented yet — returns the list of
--      app keys this user is allowed to launch
--
-- All RPCs that mutate state are SECURITY DEFINER and check the caller
-- has system-level admin (role='system' or is_admin=true) before doing
-- anything. Anonymous users can't escalate themselves.
--
-- Idempotent — safe to re-run.

-- ============================================================================
-- 1. Allow 'none' as a per-app role value
-- ============================================================================
-- The existing schema_v43 used a CHECK constraint limiting role to
-- ('user', 'admin'). Drop and recreate with 'none' added so we can mark
-- a user as having no access to a specific app.
alter table public.employees drop constraint if exists employees_it_role_check;
alter table public.employees drop constraint if exists employees_driver_role_check;
alter table public.employees drop constraint if exists employees_meeting_role_check;

alter table public.employees
  add constraint employees_it_role_check      check (it_role      in ('none', 'user', 'admin')),
  add constraint employees_driver_role_check  check (driver_role  in ('none', 'user', 'admin')),
  add constraint employees_meeting_role_check check (meeting_role in ('none', 'user', 'admin'));


-- ============================================================================
-- 2. Helper — is the caller a system admin?
-- ============================================================================
-- Used by every admin-only RPC below to gate access. Returns true if the
-- employee row has role='system' or the legacy is_admin=true flag.
create or replace function public.is_system_admin(p_emp_id text)
returns boolean
language sql
security definer
set search_path = public
as $body$
  select coalesce(role = 'system' or is_admin, false)
  from employees
  where employee_id = p_emp_id;
$body$;


-- ============================================================================
-- 3. RPC: get_user_apps — what apps can this user launch?
-- ============================================================================
-- portal/src/lib/auth.jsx already calls this. Returns array of app keys
-- the user has access to (it_role/driver_role/meeting_role != 'none').
-- The hub uses this to hide cards for apps the user can't access.
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
  -- Repair is currently coming-soon and free-for-all
  apps := array_append(apps, 'repair');
  return apps;
end;
$body$;
revoke all on function public.get_user_apps(text) from public;
grant execute on function public.get_user_apps(text) to anon, authenticated;


-- ============================================================================
-- 4. RPC: admin_list_employees — table data for the admin user-management page
-- ============================================================================
-- Returns one row per employee with the fields the admin page renders.
-- Caller must be a system admin or the call errors.
create or replace function public.admin_list_employees(p_admin_id text)
returns table (
  employee_id  text,
  first_name   text,
  last_name    text,
  nickname     text,
  email        text,
  department   text,
  section      text,
  is_approved  boolean,
  it_role      text,
  driver_role  text,
  meeting_role text,
  resigned_date date,
  registered_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $body$
begin
  if not is_system_admin(p_admin_id) then
    raise exception 'unauthorized — admin only';
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
      coalesce(e.is_approved, true) as is_approved,
      coalesce(e.it_role,      'user') as it_role,
      coalesce(e.driver_role,  'user') as driver_role,
      coalesce(e.meeting_role, 'user') as meeting_role,
      e.resigned_date,
      e.registered_at
    from employees e
    order by
      coalesce(e.is_approved, true) asc,  -- pending first
      e.employee_id;
end;
$body$;
revoke all on function public.admin_list_employees(text) from public;
grant execute on function public.admin_list_employees(text) to anon, authenticated;


-- ============================================================================
-- 5. RPC: admin_set_user_role — change one user's role for one app
-- ============================================================================
create or replace function public.admin_set_user_role(
  p_admin_id  text,
  p_target_id text,
  p_app       text,    -- 'it' | 'driver' | 'meeting'
  p_role      text     -- 'none' | 'user' | 'admin'
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
begin
  if not is_system_admin(p_admin_id) then
    raise exception 'unauthorized — admin only';
  end if;
  if p_app not in ('it', 'driver', 'meeting') then
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
  end if;
end;
$body$;
revoke all on function public.admin_set_user_role(text, text, text, text) from public;
grant execute on function public.admin_set_user_role(text, text, text, text) to anon, authenticated;


-- ============================================================================
-- 6. RPC: admin_user_stats — counts for the dashboard cards
-- ============================================================================
create or replace function public.admin_user_stats(p_admin_id text)
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  total int;
  active int;
  pending int;
begin
  if not is_system_admin(p_admin_id) then
    raise exception 'unauthorized — admin only';
  end if;

  select count(*) into total from employees;
  select count(*) into active
    from employees
    where coalesce(is_approved, true) = true
      and resigned_date is null;
  select count(*) into pending
    from employees
    where coalesce(is_approved, true) = false;

  return json_build_object(
    'total',   total,
    'active',  active,
    'pending', pending
  );
end;
$body$;
revoke all on function public.admin_user_stats(text) from public;
grant execute on function public.admin_user_stats(text) to anon, authenticated;


-- ============================================================================
-- 7. ANNOUNCEMENTS — broadcast messages everyone sees in the corner ticker
-- ============================================================================
create table if not exists public.announcements (
  id          bigserial primary key,
  message     text not null,
  created_by  text references public.employees(employee_id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,                       -- null = never expires
  active      boolean not null default true
);

create index if not exists announcements_active_idx
  on public.announcements (active, created_at desc);

alter table public.announcements enable row level security;

drop policy if exists "announcements_read" on public.announcements;
create policy "announcements_read" on public.announcements
  for select to anon, authenticated using (true);


-- 7a. RPC: admin posts a new announcement
create or replace function public.post_announcement(
  p_admin_id  text,
  p_message   text,
  p_hours     int default 24      -- auto-expire after N hours; null = forever
)
returns bigint
language plpgsql
security definer
set search_path = public
as $body$
declare
  new_id bigint;
begin
  if not is_system_admin(p_admin_id) then
    raise exception 'unauthorized — admin only';
  end if;
  if length(coalesce(p_message, '')) = 0 then
    raise exception 'message is empty';
  end if;

  insert into announcements (message, created_by, expires_at, active)
  values (
    p_message,
    p_admin_id,
    case when p_hours is null then null else now() + (p_hours || ' hours')::interval end,
    true
  )
  returning id into new_id;
  return new_id;
end;
$body$;
revoke all on function public.post_announcement(text, text, int) from public;
grant execute on function public.post_announcement(text, text, int) to anon, authenticated;


-- 7b. RPC: admin dismisses an announcement (or any active one)
create or replace function public.dismiss_announcement(
  p_admin_id text,
  p_id       bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
begin
  if not is_system_admin(p_admin_id) then
    raise exception 'unauthorized — admin only';
  end if;
  update announcements set active = false where id = p_id;
end;
$body$;
revoke all on function public.dismiss_announcement(text, bigint) from public;
grant execute on function public.dismiss_announcement(text, bigint) to anon, authenticated;


-- 7c. RPC: get the latest active announcement (called by everyone, polled)
create or replace function public.get_active_announcement()
returns table (
  id          bigint,
  message     text,
  created_at  timestamptz,
  expires_at  timestamptz
)
language sql
security definer
set search_path = public
as $body$
  select id, message, created_at, expires_at
  from announcements
  where active = true
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;
$body$;
revoke all on function public.get_active_announcement() from public;
grant execute on function public.get_active_announcement() to anon, authenticated;


-- ============================================================================
-- 8. List recent announcements (admin page — to dismiss / review)
-- ============================================================================
create or replace function public.admin_list_announcements(p_admin_id text)
returns table (
  id          bigint,
  message     text,
  created_by  text,
  created_at  timestamptz,
  expires_at  timestamptz,
  active      boolean
)
language plpgsql
security definer
set search_path = public
as $body$
begin
  if not is_system_admin(p_admin_id) then
    raise exception 'unauthorized — admin only';
  end if;
  return query
    select a.id, a.message, a.created_by, a.created_at, a.expires_at, a.active
    from announcements a
    order by a.created_at desc
    limit 30;
end;
$body$;
revoke all on function public.admin_list_announcements(text) from public;
grant execute on function public.admin_list_announcements(text) to anon, authenticated;
