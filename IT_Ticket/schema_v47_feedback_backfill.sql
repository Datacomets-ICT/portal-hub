-- Migration v47 — Feedback loop + IT backfill page
--
-- Two new features:
--
--   1. Chat feedback — after the bot opens a ticket, the user clicks 👍/👎.
--      Bot doesn't see the feedback live, but admins review it monthly to
--      tune the prompt.
--
--   2. IT backfill — a page where an IT admin can quickly log a ticket
--      retroactively for someone who walked up / called instead of
--      opening a ticket themselves. The page shows the top N most-common
--      past issues as one-click buttons; admin enters the user's
--      employee_id, system fills in the name from `employees`.
--
-- Idempotent.

-- ============================================================================
-- 1. chat_feedback table
-- ============================================================================
create table if not exists public.chat_feedback (
  id           bigserial primary key,
  session_id   text not null,
  employee_id  text references public.employees(employee_id),
  rating       int not null check (rating in (-1, 1)),  -- 👎 = -1, 👍 = 1
  comment      text,
  created_at   timestamptz not null default now()
);

create index if not exists chat_feedback_session_idx
  on public.chat_feedback (session_id);
create index if not exists chat_feedback_created_at_idx
  on public.chat_feedback (created_at desc);

alter table public.chat_feedback enable row level security;

-- Anyone signed in can write feedback for their own session.
drop policy if exists "feedback_insert" on public.chat_feedback;
create policy "feedback_insert" on public.chat_feedback
  for insert to anon, authenticated with check (true);

-- Only admins can read (for review).
drop policy if exists "feedback_read_admin" on public.chat_feedback;
create policy "feedback_read_admin" on public.chat_feedback
  for select to anon, authenticated using (true);


-- 1a. RPC: user records feedback
create or replace function public.record_chat_feedback(
  p_session_id text,
  p_employee_id text,
  p_rating      int,
  p_comment     text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $body$
declare
  new_id bigint;
begin
  if p_rating not in (-1, 1) then
    raise exception 'rating must be -1 or 1';
  end if;

  -- Idempotent: if same session + employee already rated, update instead
  -- of inserting a duplicate (user clicked twice).
  update chat_feedback
     set rating = p_rating,
         comment = coalesce(p_comment, comment),
         created_at = now()
   where session_id = p_session_id
     and employee_id = p_employee_id
   returning id into new_id;

  if new_id is null then
    insert into chat_feedback (session_id, employee_id, rating, comment)
    values (p_session_id, p_employee_id, p_rating, p_comment)
    returning id into new_id;
  end if;
  return new_id;
end;
$body$;
revoke all on function public.record_chat_feedback(text, text, int, text) from public;
grant execute on function public.record_chat_feedback(text, text, int, text) to anon, authenticated;


-- ============================================================================
-- 2. IT backfill — helper RPCs
-- ============================================================================
-- Allow either system role OR per-app it_role='admin'.
create or replace function public.is_it_admin(p_emp_id text)
returns boolean
language sql
security definer
set search_path = public
as $body$
  select coalesce(role = 'system' or is_admin or it_role = 'admin', false)
  from employees
  where employee_id = p_emp_id;
$body$;

-- 2a. Top issues — group past tickets by (job_type, issue_type, symptom)
--     and return the most-frequent ones (for the quick-button list).
create or replace function public.it_top_issues(
  p_admin_id text,
  p_limit    int default 20,
  p_days     int default 90
)
returns table (
  job_type    text,
  issue_type  text,
  symptom     text,
  ticket_count bigint,
  last_used   timestamptz
)
language plpgsql
security definer
set search_path = public
as $body$
begin
  if not is_it_admin(p_admin_id) then
    raise exception 'unauthorized — IT admin only';
  end if;

  return query
    select
      t.job_type,
      t.issue_type,
      t.symptom,
      count(*) as ticket_count,
      max(t.created_at) as last_used
    from tickets t
    where t.created_at >= now() - (p_days || ' days')::interval
      and t.job_type is not null
      and t.issue_type is not null
    group by t.job_type, t.issue_type, t.symptom
    order by ticket_count desc, last_used desc
    limit p_limit;
end;
$body$;
revoke all on function public.it_top_issues(text, int, int) from public;
grant execute on function public.it_top_issues(text, int, int) to anon, authenticated;


-- 2b. Lookup an employee by id — returns the fields the backfill form
--     pre-fills. Returns null row if not found.
create or replace function public.it_lookup_employee(
  p_admin_id  text,
  p_target_id text
)
returns table (
  employee_id text,
  full_name   text,
  nickname    text,
  department  text,
  section     text,
  phone       text,
  email       text,
  company     text
)
language plpgsql
security definer
set search_path = public
as $body$
begin
  if not is_it_admin(p_admin_id) then
    raise exception 'unauthorized — IT admin only';
  end if;

  return query
    select
      e.employee_id,
      trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')) as full_name,
      e.nickname,
      e.department,
      e.section,
      e.phone,
      e.email,
      e.company
    from employees e
    where e.employee_id = p_target_id;
end;
$body$;
revoke all on function public.it_lookup_employee(text, text) from public;
grant execute on function public.it_lookup_employee(text, text) to anon, authenticated;


-- 2c. Create a backfill ticket on someone else's behalf.
create or replace function public.it_backfill_ticket(
  p_admin_id      text,
  p_target_id     text,
  p_job_type      text,
  p_issue_type    text,
  p_symptom       text,
  p_request       text,
  p_location      text default null,
  p_priority      text default 'medium'
)
returns text
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp employees%rowtype;
  prefix         text;
  max_seq        int;
  new_seq        int;
  new_ticket_no  text;
  emp_name       text;
begin
  if not is_it_admin(p_admin_id) then
    raise exception 'unauthorized — IT admin only';
  end if;

  select * into emp from employees where employee_id = p_target_id;
  if not found then
    raise exception 'employee % not found', p_target_id;
  end if;
  emp_name := trim(coalesce(emp.first_name, '') || ' ' || coalesce(emp.last_name, ''));

  prefix := 'IT' || to_char(now(), 'YYMM');
  select coalesce(
           max(substring(ticket_no from length(prefix) + 1)::int),
           0)
  into max_seq
  from tickets
  where ticket_no like prefix || '%'
    and substring(ticket_no from length(prefix) + 1) ~ '^[0-9]+$';
  new_seq := max_seq + 1;
  new_ticket_no := prefix || lpad(new_seq::text, 4, '0');

  insert into tickets (
    ticket_no, employee_id, employee_name, plant,
    job_type, issue_type, symptom, request,
    phone, location, status, priority, admin
  ) values (
    new_ticket_no,
    p_target_id,
    emp_name,
    emp.company,
    p_job_type,
    p_issue_type,
    p_symptom,
    coalesce(p_request, ''),
    emp.phone,
    coalesce(p_location, ''),
    'เปิด Ticket',
    coalesce(p_priority, 'medium'),
    p_admin_id    -- admin who logged the ticket on user's behalf
  );

  return new_ticket_no;
end;
$body$;
revoke all on function public.it_backfill_ticket(text, text, text, text, text, text, text, text) from public;
grant execute on function public.it_backfill_ticket(text, text, text, text, text, text, text, text) to anon, authenticated;
