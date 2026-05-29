-- ============================================================
-- Phase 13: Chat file/image attachments
-- ============================================================

alter table ticket_messages add column if not exists attachment_url text;
alter table ticket_messages add column if not exists attachment_name text;
alter table ticket_messages add column if not exists attachment_type text;   -- 'image' or 'file'

-- Updated RPC: send message with optional attachment
create or replace function send_ticket_message(
  p_emp_id          text,
  p_password        text,
  p_ticket_key      bigint,
  p_message         text,
  p_attachment_url  text default null,
  p_attachment_name text default null,
  p_attachment_type text default null
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

  insert into ticket_messages (
    ticket_key, ticket_no, sender_id, sender_name, is_admin, message,
    attachment_url, attachment_name, attachment_type
  )
  values (
    p_ticket_key, t.ticket_no, emp.employee_id, sender_display, coalesce(emp.is_admin, false),
    coalesce(p_message, ''),
    p_attachment_url, p_attachment_name, p_attachment_type
  );

  insert into ticket_message_reads (employee_id, ticket_key, last_read_at)
  values (p_emp_id, p_ticket_key, now())
  on conflict (employee_id, ticket_key) do update set last_read_at = now();

  return json_build_object('success', true);
end;
$body$;

grant execute on function send_ticket_message(text, text, bigint, text, text, text, text) to anon, authenticated;

-- Also update get_ticket_messages to return attachments
create or replace function get_ticket_messages(p_ticket_key bigint)
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  result json;
begin
  select json_agg(row_to_json(t)) into result
  from (
    select
      id,
      sender_id as "senderId",
      sender_name as "senderName",
      is_admin as "isAdmin",
      message,
      attachment_url as "attachmentUrl",
      attachment_name as "attachmentName",
      attachment_type as "attachmentType",
      created_at as "createdAt"
    from ticket_messages
    where ticket_key = p_ticket_key
    order by created_at asc
  ) t;
  return coalesce(result, '[]'::json);
end;
$body$;

grant execute on function get_ticket_messages(bigint) to anon, authenticated;

-- Updated get_unread_ticket_chats to also show attachment indicator in preview
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
      max(tm.created_at) as "lastAt",
      (array_agg(
        case
          when tm.attachment_type = 'image' then '📷 ' || coalesce(nullif(tm.message, ''), 'ส่งรูปภาพ')
          when tm.attachment_type = 'file'  then '📎 ' || coalesce(tm.attachment_name, 'ไฟล์แนบ')
          else tm.message
        end
        order by tm.created_at desc))[1] as "lastMessage",
      (array_agg(tm.sender_name order by tm.created_at desc))[1] as "lastSender"
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

grant execute on function get_unread_ticket_chats(text) to anon, authenticated;
