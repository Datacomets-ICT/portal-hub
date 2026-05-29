-- ============================================================
-- Phase 9: User notifications + prevent AI hallucination
-- ============================================================

-- Notification table for all users (not just admin)
create table if not exists notifications (
  id            bigserial primary key,
  employee_id   text not null,
  ticket_no     text,
  title         text not null,
  message       text,
  is_read       boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists notif_emp_idx on notifications(employee_id, is_read);
create index if not exists notif_created_idx on notifications(created_at desc);

alter table notifications enable row level security;

drop policy if exists "notif_read" on notifications;
create policy "notif_read" on notifications
  for select to anon using (true);

drop policy if exists "notif_update" on notifications;
create policy "notif_update" on notifications
  for update to anon using (true);

-- RPC: get my notifications
create or replace function get_my_notifications(p_emp_id text, p_limit int default 20)
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
    select id, ticket_no as "ticketNo", title, message,
           is_read as "isRead", created_at as "createdAt"
    from notifications
    where employee_id = p_emp_id
    order by created_at desc
    limit p_limit
  ) t;
  return coalesce(result, '[]'::json);
end;
$body$;

revoke all on function get_my_notifications(text, int) from public;
grant execute on function get_my_notifications(text, int) to anon, authenticated;

-- RPC: mark notifications as read
create or replace function mark_notifications_read(p_emp_id text)
returns void
language plpgsql
security definer
set search_path = public
as $body$
begin
  update notifications set is_read = true
  where employee_id = p_emp_id and is_read = false;
end;
$body$;

revoke all on function mark_notifications_read(text) from public;
grant execute on function mark_notifications_read(text) to anon, authenticated;

-- Update update_ticket to also create notification for the ticket owner
create or replace function update_ticket(
  p_emp_id   text,
  p_password text,
  payload    json
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  is_adm    boolean;
  emp       employees%rowtype;
  tid       bigint;
  old_row   tickets%rowtype;
  new_status text;
  new_admin  text;
  new_reply  text;
  admin_label text;
  notif_msg  text;
begin
  select * into emp
  from employees
  where employee_id = p_emp_id and password = p_password;

  is_adm := coalesce(emp.is_admin, false);
  if not is_adm then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์ admin');
  end if;

  tid := (payload->>'key')::bigint;

  select * into old_row from tickets where key = tid;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่พบ ticket');
  end if;

  new_status := coalesce(nullif(payload->>'status', ''), old_row.status);
  new_admin  := coalesce(payload->>'admin',  old_row.admin);
  new_reply  := coalesce(payload->>'reply',  old_row.reply);

  admin_label := trim(coalesce(emp.first_name, '') || ' ' || coalesce(emp.last_name, ''));
  if admin_label = '' then admin_label := emp.employee_id; end if;

  -- Write history
  if coalesce(old_row.status, '') <> coalesce(new_status, '') then
    insert into ticket_history (ticket_key, ticket_no, changed_by_id, changed_by_name, field, old_value, new_value)
    values (tid, old_row.ticket_no, emp.employee_id, admin_label, 'status', old_row.status, new_status);
  end if;

  if coalesce(old_row.admin, '') <> coalesce(new_admin, '') then
    insert into ticket_history (ticket_key, ticket_no, changed_by_id, changed_by_name, field, old_value, new_value)
    values (tid, old_row.ticket_no, emp.employee_id, admin_label, 'admin', old_row.admin, new_admin);
  end if;

  if coalesce(old_row.reply, '') <> coalesce(new_reply, '') then
    insert into ticket_history (ticket_key, ticket_no, changed_by_id, changed_by_name, field, old_value, new_value)
    values (tid, old_row.ticket_no, emp.employee_id, admin_label, 'reply', old_row.reply, new_reply);
  end if;

  -- Update ticket
  update tickets set
    status = new_status,
    admin  = new_admin,
    reply  = new_reply
  where key = tid;

  -- Create notification for ticket owner (if they exist)
  if old_row.employee_id is not null and old_row.employee_id <> '' then
    notif_msg := '';

    if coalesce(old_row.status, '') <> coalesce(new_status, '') then
      notif_msg := 'สถานะเปลี่ยนเป็น "' || new_status || '"';
    end if;

    if coalesce(old_row.admin, '') <> coalesce(new_admin, '') and new_admin is not null then
      if notif_msg <> '' then notif_msg := notif_msg || ' / '; end if;
      notif_msg := notif_msg || 'ผู้รับผิดชอบ: ' || new_admin;
    end if;

    if coalesce(old_row.reply, '') <> coalesce(new_reply, '') and new_reply is not null and new_reply <> '' then
      if notif_msg <> '' then notif_msg := notif_msg || ' / '; end if;
      notif_msg := notif_msg || 'วิธีแก้ไข: ' || left(new_reply, 100);
    end if;

    if notif_msg <> '' then
      insert into notifications (employee_id, ticket_no, title, message)
      values (
        old_row.employee_id,
        old_row.ticket_no,
        'Ticket ' || old_row.ticket_no || ' มีการอัพเดท',
        notif_msg
      );
    end if;
  end if;

  return json_build_object('success', true);
end;
$body$;

revoke all on function update_ticket(text, text, json) from public;
grant execute on function update_ticket(text, text, json) to anon, authenticated;
