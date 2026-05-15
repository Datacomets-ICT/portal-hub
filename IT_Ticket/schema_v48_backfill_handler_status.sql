-- Migration v48 — extend it_backfill_ticket with handler + status
--
-- Original it_backfill_ticket (v47) hard-coded:
--   - admin = the caller (the IT person logged in)
--   - status = 'เปิด Ticket' (always opens fresh)
--
-- Real-world IT backfill needs more flexibility:
--   - The caller might be opening a ticket for a request that was
--     handled by ANOTHER IT person, so admin/handler must be selectable.
--   - Walk-up requests are often already done by the time IT logs them,
--     so status should default to one of the in-progress / done states.
--
-- This migration drops the v47 function and replaces it with two new
-- params (p_handler_id, p_status). Frontend BackfillPage updated to
-- match.
--
-- Idempotent.

-- Drop v47 signature first (PG won't auto-replace when arity changes)
drop function if exists public.it_backfill_ticket(text, text, text, text, text, text, text, text);

create or replace function public.it_backfill_ticket(
  p_admin_id      text,
  p_target_id     text,    -- the user who has the problem (employee_id)
  p_handler_id    text,    -- the IT person actually doing the work
  p_job_type      text,
  p_issue_type    text,
  p_symptom       text,
  p_request       text,
  p_location      text default null,
  p_priority      text default 'medium',
  p_status        text default 'เปิด Ticket'
)
returns text
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp employees%rowtype;
  handler employees%rowtype;
  prefix         text;
  max_seq        int;
  new_seq        int;
  new_ticket_no  text;
  emp_name       text;
  handler_label  text;
  resolved       timestamptz;
begin
  if not is_it_admin(p_admin_id) then
    raise exception 'unauthorized — IT admin only';
  end if;

  -- Requester (the actual user with the problem)
  select * into emp from employees where employee_id = p_target_id;
  if not found then
    raise exception 'requester employee % not found', p_target_id;
  end if;
  emp_name := trim(coalesce(emp.first_name, '') || ' ' || coalesce(emp.last_name, ''));

  -- Handler (the IT person; can be anyone — does not have to be the caller).
  -- If the handler id doesn't resolve to an employee row, just store the
  -- raw id so the ticket isn't blocked by a typo.
  select * into handler from employees where employee_id = coalesce(p_handler_id, p_admin_id);
  if found then
    handler_label := coalesce(
      nullif(trim(coalesce(handler.first_name, '') || ' ' || coalesce(handler.last_name, '')), ''),
      handler.nickname,
      handler.employee_id
    );
  else
    handler_label := coalesce(p_handler_id, p_admin_id);
  end if;

  -- If admin marks the ticket already closed/done, fill resolved_at too
  -- so SLA/dashboards see the right window.
  if p_status in ('ดำเนินการเรียบร้อย', 'ปิดงานแล้ว') then
    resolved := now();
  end if;

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
    phone, location, status, priority, admin, resolved_at
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
    coalesce(p_status, 'เปิด Ticket'),
    coalesce(p_priority, 'medium'),
    handler_label,
    resolved
  );

  return new_ticket_no;
end;
$body$;
revoke all on function public.it_backfill_ticket(text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.it_backfill_ticket(text, text, text, text, text, text, text, text, text, text) to anon, authenticated;
