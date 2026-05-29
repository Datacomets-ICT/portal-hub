-- ============================================================
-- Phase 12: Quick Chat — auto-create blank ticket for direct IT contact
-- ============================================================

create or replace function create_quick_chat_ticket(
  p_emp_id   text,
  p_password text
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp employees%rowtype;
  prefix text;
  max_seq int;
  new_seq int;
  new_ticket_no text;
  new_key bigint;
begin
  select * into emp from employees
  where employee_id = p_emp_id and password = p_password;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์');
  end if;

  prefix := 'IT' || to_char(now(), 'YYMM');
  select coalesce(max(substring(ticket_no from length(prefix) + 1)::int), 0)
    into max_seq
  from tickets
  where ticket_no like prefix || '%'
    and length(ticket_no) > length(prefix)
    and substring(ticket_no from length(prefix) + 1) similar to '[0-9]+';

  new_seq := max_seq + 1;
  new_ticket_no := prefix || lpad(new_seq::text, 4, '0');

  insert into tickets (
    ticket_no, employee_id, employee_name, plant,
    job_type, issue_type, symptom, request,
    status
  ) values (
    new_ticket_no,
    emp.employee_id,
    trim(coalesce(emp.first_name, '') || ' ' || coalesce(emp.last_name, '')),
    coalesce(emp.company, ''),
    'อื่นๆ',
    'แชทด่วน',
    'ติดต่อทีม IT โดยตรง',
    'ติดต่อทีม IT ผ่านแชทด่วน (สอบถาม/แจ้งปัญหา)',
    'เปิด Ticket'
  )
  returning key into new_key;

  return json_build_object(
    'success', true,
    'ticketKey', new_key,
    'ticketNo', new_ticket_no
  );
end;
$body$;

revoke all on function create_quick_chat_ticket(text, text) from public;
grant execute on function create_quick_chat_ticket(text, text) to anon, authenticated;
