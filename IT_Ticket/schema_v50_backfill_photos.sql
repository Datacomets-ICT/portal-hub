-- Migration v50 — backfill ticket can attach proof photos
--
-- The new Backfill UI requires proof photos when status is set to a
-- "completed" state (ดำเนินการเรียบร้อย / ปิดงานแล้ว). Photos are
-- uploaded by the frontend to storage bucket `ticket-attachments`
-- (already provisioned in migration_1_tables.sql), and the resulting
-- public URLs are passed to this RPC as a text[] for storage in
-- tickets.photo_urls (existing column).
--
-- Drops v48's 10-arg signature; replaces with 11-arg version.
-- Idempotent.

drop function if exists public.it_backfill_ticket(text, text, text, text, text, text, text, text, text, text);

create or replace function public.it_backfill_ticket(
  p_admin_id      text,
  p_target_id     text,
  p_handler_id    text,
  p_job_type      text,
  p_issue_type    text,
  p_symptom       text,
  p_request       text,
  p_location      text default null,
  p_priority      text default 'medium',
  p_status        text default 'กำลังดำเนินการ',
  p_photo_urls    text[] default null
)
returns text
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp            employees%rowtype;
  handler        employees%rowtype;
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

  select * into emp from employees where employee_id = p_target_id;
  if not found then
    raise exception 'requester employee % not found', p_target_id;
  end if;
  emp_name := trim(coalesce(emp.first_name, '') || ' ' || coalesce(emp.last_name, ''));

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
    phone, location, status, priority, admin, resolved_at,
    photo_urls
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
    coalesce(p_status, 'กำลังดำเนินการ'),
    coalesce(p_priority, 'medium'),
    handler_label,
    resolved,
    coalesce(p_photo_urls, '{}')
  );

  return new_ticket_no;
end;
$body$;

revoke all on function public.it_backfill_ticket(text, text, text, text, text, text, text, text, text, text, text[]) from public;
grant execute on function public.it_backfill_ticket(text, text, text, text, text, text, text, text, text, text, text[]) to anon, authenticated;
