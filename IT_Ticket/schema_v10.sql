-- ============================================================
-- Phase 10: Ticket Chat (Admin <-> User conversation per ticket)
-- ============================================================

create table if not exists ticket_messages (
  id            bigserial primary key,
  ticket_key    bigint not null,
  ticket_no     text,
  sender_id     text not null,
  sender_name   text,
  is_admin      boolean not null default false,
  message       text not null,
  created_at    timestamptz not null default now()
);

create index if not exists tm_ticket_idx on ticket_messages(ticket_key);
create index if not exists tm_created_idx on ticket_messages(created_at desc);

alter table ticket_messages enable row level security;

drop policy if exists "tm_read" on ticket_messages;
create policy "tm_read" on ticket_messages for select to anon using (true);

-- RPC: send message (and create notification)
create or replace function send_ticket_message(
  p_emp_id    text,
  p_password  text,
  p_ticket_key bigint,
  p_message   text
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp employees%rowtype;
  t   tickets%rowtype;
  sender_display text;
  target_emp_id text;
  notif_title text;
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

  sender_display := trim(coalesce(emp.nickname, '') || ' ' || coalesce(emp.first_name, ''));
  if sender_display = '' then sender_display := emp.employee_id; end if;

  -- Only ticket owner or admin can send
  if emp.employee_id <> t.employee_id and not coalesce(emp.is_admin, false) then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์ส่งข้อความใน ticket นี้');
  end if;

  -- Insert message
  insert into ticket_messages (ticket_key, ticket_no, sender_id, sender_name, is_admin, message)
  values (p_ticket_key, t.ticket_no, emp.employee_id, sender_display, coalesce(emp.is_admin, false), p_message);

  -- Create notification for the OTHER party
  if coalesce(emp.is_admin, false) then
    -- Admin sent → notify ticket owner
    target_emp_id := t.employee_id;
    notif_title := 'ข้อความใหม่จากทีม IT (' || t.ticket_no || ')';
  else
    -- User sent → notify all admins (handled separately - skip for now, admin will see when opening ticket)
    target_emp_id := null;
  end if;

  if target_emp_id is not null and target_emp_id <> '' then
    insert into notifications (employee_id, ticket_no, title, message)
    values (target_emp_id, t.ticket_no, notif_title, left(p_message, 100));
  end if;

  return json_build_object('success', true);
end;
$body$;

revoke all on function send_ticket_message(text, text, bigint, text) from public;
grant execute on function send_ticket_message(text, text, bigint, text) to anon, authenticated;

-- RPC: get messages for a ticket
create or replace function get_ticket_messages(p_ticket_key bigint)
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  result json;
begin
  select json_agg(row_to_json(t) order by t.created_at asc) into result
  from (
    select
      id,
      sender_id as "senderId",
      sender_name as "senderName",
      is_admin as "isAdmin",
      message,
      created_at as "createdAt"
    from ticket_messages
    where ticket_key = p_ticket_key
    order by created_at asc
  ) t;
  return coalesce(result, '[]'::json);
end;
$body$;

revoke all on function get_ticket_messages(bigint) from public;
grant execute on function get_ticket_messages(bigint) to anon, authenticated;
