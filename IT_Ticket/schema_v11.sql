-- ============================================================
-- Phase 11: Mark ticket messages as read (per user)
-- ============================================================

-- Track which ticket messages each user has read
create table if not exists ticket_message_reads (
  employee_id   text not null,
  ticket_key    bigint not null,
  last_read_at  timestamptz not null default now(),
  primary key (employee_id, ticket_key)
);

alter table ticket_message_reads enable row level security;

drop policy if exists "tmr_all" on ticket_message_reads;
create policy "tmr_all" on ticket_message_reads for all to anon using (true) with check (true);

-- RPC: get unread ticket messages count + list per user
-- Returns list of {ticketKey, ticketNo, unreadCount, lastMessage, lastSenderName, lastAt}
create or replace function get_unread_ticket_chats(p_emp_id text)
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  result json;
  is_adm boolean;
begin
  select coalesce(is_admin, false) into is_adm from employees where employee_id = p_emp_id;

  select json_agg(row_to_json(x)) into result
  from (
    select
      tm.ticket_key    as "ticketKey",
      tm.ticket_no     as "ticketNo",
      count(*) filter (where tm.sender_id <> p_emp_id
                       and tm.created_at > coalesce(r.last_read_at, '1970-01-01'::timestamptz))::int as "unreadCount",
      max(tm.created_at) as "lastAt"
    from ticket_messages tm
    left join ticket_message_reads r
      on r.ticket_key = tm.ticket_key and r.employee_id = p_emp_id
    where exists (
      select 1 from tickets t
      where t.key = tm.ticket_key
        and (t.employee_id = p_emp_id or is_adm)
    )
    group by tm.ticket_key, tm.ticket_no, r.last_read_at
    order by max(tm.created_at) desc
    limit 50
  ) x;

  return coalesce(result, '[]'::json);
end;
$body$;

revoke all on function get_unread_ticket_chats(text) from public;
grant execute on function get_unread_ticket_chats(text) to anon, authenticated;

-- RPC: mark a ticket chat as read
create or replace function mark_ticket_chat_read(p_emp_id text, p_ticket_key bigint)
returns void
language plpgsql
security definer
set search_path = public
as $body$
begin
  insert into ticket_message_reads (employee_id, ticket_key, last_read_at)
  values (p_emp_id, p_ticket_key, now())
  on conflict (employee_id, ticket_key)
  do update set last_read_at = now();
end;
$body$;

revoke all on function mark_ticket_chat_read(text, bigint) from public;
grant execute on function mark_ticket_chat_read(text, bigint) to anon, authenticated;

-- Also: when update_ticket sends admin reply, don't create notification for user's notification bell
-- (they'll see it via ticket chat badge instead)
-- Also: when send_ticket_message is called, remove the general notification (chat badge handles it)

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
begin
  select * into emp from employees
  where employee_id = p_emp_id and password = p_password;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์');
  end if;

  select * into t from tickets where key = p_ticket_key;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่พบ ticket');
  end if;

  sender_display := trim(coalesce(emp.nickname, '') || ' ' || coalesce(emp.first_name, ''));
  if sender_display = '' then sender_display := emp.employee_id; end if;

  if emp.employee_id <> t.employee_id and not coalesce(emp.is_admin, false) then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์ส่งข้อความใน ticket นี้');
  end if;

  insert into ticket_messages (ticket_key, ticket_no, sender_id, sender_name, is_admin, message)
  values (p_ticket_key, t.ticket_no, emp.employee_id, sender_display, coalesce(emp.is_admin, false), p_message);

  -- Mark as read for sender
  insert into ticket_message_reads (employee_id, ticket_key, last_read_at)
  values (p_emp_id, p_ticket_key, now())
  on conflict (employee_id, ticket_key) do update set last_read_at = now();

  return json_build_object('success', true);
end;
$body$;

grant execute on function send_ticket_message(text, text, bigint, text) to anon, authenticated;

-- Delete old chat notifications (so they don't keep the bell showing)
delete from notifications where title like 'ข้อความใหม่จากทีม IT%';
