-- ============================================================
-- Phase 14: User cancel ticket (owner only, and only if not yet in progress)
-- ============================================================

create or replace function cancel_my_ticket(
  p_emp_id     text,
  p_password   text,
  p_ticket_key bigint
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp employees%rowtype;
  t   tickets%rowtype;
  cancel_note text;
begin
  -- Verify user
  select * into emp from employees
  where employee_id = p_emp_id and password = p_password;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์');
  end if;

  -- Get ticket
  select * into t from tickets where key = p_ticket_key;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่พบ ticket');
  end if;

  -- Only owner can cancel
  if t.employee_id <> p_emp_id then
    return json_build_object('success', false, 'message', 'ยกเลิกได้เฉพาะ Ticket ของตัวเอง');
  end if;

  -- Can cancel only if status is "เปิด Ticket" (not started yet)
  if t.status <> 'เปิด Ticket' then
    return json_build_object('success', false, 'message', 'ไม่สามารถยกเลิกได้เนื่องจาก Ticket อยู่ในสถานะ "' || t.status || '" แล้ว');
  end if;

  cancel_note := 'ยกเลิกโดยผู้แจ้ง';

  -- Update status + add history
  update tickets set status = 'ยกเลิก', reply = cancel_note where key = p_ticket_key;

  insert into ticket_history (ticket_key, ticket_no, changed_by_id, changed_by_name, field, old_value, new_value)
  values (
    p_ticket_key, t.ticket_no, emp.employee_id,
    trim(coalesce(emp.first_name, '') || ' ' || coalesce(emp.last_name, '')),
    'status', t.status, 'ยกเลิก'
  );

  return json_build_object('success', true);
end;
$body$;

revoke all on function cancel_my_ticket(text, text, bigint) from public;
grant execute on function cancel_my_ticket(text, text, bigint) to anon, authenticated;
