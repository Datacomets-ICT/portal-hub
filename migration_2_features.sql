-- ============================================================
-- Migration Part 2/3: Features (KB, chat, notifications, profile)
-- ============================================================


-- === schema_v5.sql ===
-- ============================================================
-- Phase 5: Knowledge Base for AI chatbot RAG
-- Run this entire file in Supabase SQL Editor (safe to re-run)
-- ============================================================

create table if not exists knowledge_base (
  id          bigserial primary key,
  source      text not null,         -- 'ticket_reply', 'manual', 'faq'
  source_ref  text,                  -- ticket_no or filename
  category    text,                  -- job_type or manual category
  title       text,                  -- short title / symptom
  content     text not null,         -- the actual knowledge text
  keywords    text,                  -- space-separated keywords for search
  created_at  timestamptz not null default now()
);

create index if not exists kb_keywords_idx on knowledge_base using gin (to_tsvector('simple', coalesce(keywords, '') || ' ' || coalesce(title, '') || ' ' || coalesce(content, '')));
create index if not exists kb_category_idx on knowledge_base(category);
create index if not exists kb_source_idx on knowledge_base(source);

alter table knowledge_base enable row level security;

drop policy if exists "kb_read" on knowledge_base;
create policy "kb_read" on knowledge_base
  for select to anon using (true);

-- ===== search_knowledge() RPC =====
-- Full-text search + keyword matching, returns top N results

create or replace function search_knowledge(p_query text, p_limit int default 5)
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  result json;
  search_tsquery tsquery;
begin
  -- Build tsquery from user input (split by spaces, OR them)
  search_tsquery := plainto_tsquery('simple', p_query);

  select json_agg(row_to_json(t)) into result
  from (
    select
      id,
      source,
      source_ref  as "sourceRef",
      category,
      title,
      content,
      ts_rank(
        to_tsvector('simple', coalesce(keywords, '') || ' ' || coalesce(title, '') || ' ' || coalesce(content, '')),
        search_tsquery
      ) as rank
    from knowledge_base
    where to_tsvector('simple', coalesce(keywords, '') || ' ' || coalesce(title, '') || ' ' || coalesce(content, ''))
          @@ search_tsquery
    order by rank desc
    limit p_limit
  ) t;

  return coalesce(result, '[]'::json);
end;
$body$;

revoke all on function search_knowledge(text, int) from public;
grant execute on function search_knowledge(text, int) to anon, authenticated;

-- === schema_v6.sql ===
-- ============================================================
-- Phase 6: Chat usage tracking (daily quota counter)
-- ============================================================

create table if not exists chat_usage (
  usage_date    date primary key default current_date,
  request_count int not null default 0
);

alter table chat_usage enable row level security;

drop policy if exists "usage_read" on chat_usage;
create policy "usage_read" on chat_usage
  for select to anon using (true);

-- RPC: increment counter and return current count
create or replace function increment_chat_usage()
returns int
language plpgsql
security definer
set search_path = public
as $body$
declare
  current_count int;
begin
  insert into chat_usage (usage_date, request_count)
  values (current_date, 1)
  on conflict (usage_date)
  do update set request_count = chat_usage.request_count + 1
  returning request_count into current_count;

  return current_count;
end;
$body$;

revoke all on function increment_chat_usage() from public;
grant execute on function increment_chat_usage() to anon, authenticated;

-- RPC: get today's count (without incrementing)
create or replace function get_chat_usage()
returns int
language plpgsql
security definer
set search_path = public
as $body$
declare
  current_count int;
begin
  select request_count into current_count
  from chat_usage
  where usage_date = current_date;

  return coalesce(current_count, 0);
end;
$body$;

revoke all on function get_chat_usage() from public;
grant execute on function get_chat_usage() to anon, authenticated;

-- RPC: force-set today's count (used when Gemini returns 429 to sync our counter)
create or replace function sync_chat_usage(p_count int)
returns void
language plpgsql
security definer
set search_path = public
as $body$
begin
  insert into chat_usage (usage_date, request_count)
  values (current_date, p_count)
  on conflict (usage_date)
  do update set request_count = p_count;
end;
$body$;

revoke all on function sync_chat_usage(int) from public;
grant execute on function sync_chat_usage(int) to anon, authenticated;

-- === schema_v7.sql ===
-- ============================================================
-- Phase 7: Chat learning — save conversations + auto-learn from resolved tickets
-- ============================================================

-- ===== Chat logs table =====
create table if not exists chat_logs (
  id            bigserial primary key,
  session_id    text not null,
  employee_id   text,
  role          text not null,       -- 'user' or 'assistant'
  content       text not null,
  created_at    timestamptz not null default now()
);

create index if not exists chat_logs_session_idx on chat_logs(session_id);
create index if not exists chat_logs_created_idx on chat_logs(created_at desc);

alter table chat_logs enable row level security;

-- Anon can insert (for saving chat) and admins can read
drop policy if exists "chat_logs_insert" on chat_logs;
create policy "chat_logs_insert" on chat_logs
  for insert to anon with check (true);

drop policy if exists "chat_logs_read" on chat_logs;
create policy "chat_logs_read" on chat_logs
  for select to anon using (true);

-- ===== Auto-learn: when ticket is resolved with a reply, add to knowledge_base =====
-- This function runs AFTER update on tickets

create or replace function auto_learn_from_ticket()
returns trigger
language plpgsql
security definer
set search_path = public
as $body$
declare
  kb_exists boolean;
  kw text;
begin
  -- Only trigger when status changes to resolved AND reply is not empty
  if NEW.status = 'ดำเนินการเรียบร้อย'
     and coalesce(NEW.reply, '') <> ''
     and (OLD.status <> 'ดำเนินการเรียบร้อย' or coalesce(OLD.reply, '') <> coalesce(NEW.reply, ''))
  then
    -- Check if we already have this ticket in KB
    select exists(
      select 1 from knowledge_base
      where source = 'auto_learn' and source_ref = NEW.ticket_no
    ) into kb_exists;

    -- Build keywords from ticket fields
    kw := coalesce(NEW.job_type, '') || ' ' ||
          coalesce(NEW.issue_type, '') || ' ' ||
          coalesce(NEW.symptom, '') || ' ' ||
          coalesce(NEW.request, '');

    if kb_exists then
      -- Update existing entry
      update knowledge_base set
        content = 'ปัญหา: ' || coalesce(NEW.request, '') || chr(10) || 'วิธีแก้: ' || NEW.reply,
        keywords = kw,
        title = coalesce(NEW.job_type, '') || ' > ' || coalesce(NEW.issue_type, '') || ' > ' || coalesce(NEW.symptom, ''),
        created_at = now()
      where source = 'auto_learn' and source_ref = NEW.ticket_no;
    else
      -- Insert new entry
      insert into knowledge_base (source, source_ref, category, title, content, keywords)
      values (
        'auto_learn',
        NEW.ticket_no,
        coalesce(NEW.job_type, 'อื่นๆ'),
        coalesce(NEW.job_type, '') || ' > ' || coalesce(NEW.issue_type, '') || ' > ' || coalesce(NEW.symptom, ''),
        'ปัญหา: ' || coalesce(NEW.request, '') || chr(10) || 'วิธีแก้: ' || NEW.reply,
        kw
      );
    end if;
  end if;

  return NEW;
end;
$body$;

-- Create trigger
drop trigger if exists ticket_auto_learn on tickets;
create trigger ticket_auto_learn
  after update on tickets
  for each row
  execute function auto_learn_from_ticket();

-- ===== RPC: save chat message =====
create or replace function save_chat_message(
  p_session_id text,
  p_employee_id text,
  p_role text,
  p_content text
) returns void
language plpgsql
security definer
set search_path = public
as $body$
begin
  insert into chat_logs (session_id, employee_id, role, content)
  values (p_session_id, p_employee_id, p_role, p_content);
end;
$body$;

revoke all on function save_chat_message(text, text, text, text) from public;
grant execute on function save_chat_message(text, text, text, text) to anon, authenticated;

-- ===== RPC: get frequently asked questions (for admin dashboard) =====
create or replace function get_frequent_questions(p_limit int default 10)
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
      content as question,
      count(*) as ask_count,
      max(created_at) as last_asked
    from chat_logs
    where role = 'user'
      and length(content) > 5
      and created_at > now() - interval '30 days'
    group by content
    having count(*) >= 2
    order by count(*) desc
    limit p_limit
  ) t;

  return coalesce(result, '[]'::json);
end;
$body$;

revoke all on function get_frequent_questions(int) from public;
grant execute on function get_frequent_questions(int) to anon, authenticated;

-- === schema_v8.sql ===
-- ============================================================
-- Phase 8: Registration + Admin approval + active/resigned filter
-- ============================================================

-- Add columns for registration approval + resigned tracking
alter table employees add column if not exists is_approved boolean not null default true;
alter table employees add column if not exists resigned_date date;
alter table employees add column if not exists registered_at timestamptz;

-- Existing employees are already approved
update employees set is_approved = true where is_approved is null;

-- ===== Updated login() — block resigned + unapproved =====

create or replace function login(p_emp_id text, p_password text)
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp employees%rowtype;
begin
  select * into emp
  from employees
  where employee_id = p_emp_id
    and password    = p_password;

  if not found then
    return json_build_object(
      'success', false,
      'message', 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง'
    );
  end if;

  -- Block resigned employees
  if emp.resigned_date is not null then
    return json_build_object(
      'success', false,
      'message', 'บัญชีนี้ถูกปิดการใช้งานแล้ว กรุณาติดต่อฝ่าย IT'
    );
  end if;

  -- Block unapproved registrations
  if not coalesce(emp.is_approved, false) then
    return json_build_object(
      'success', false,
      'message', 'บัญชีของคุณยังรอการอนุมัติจากทีม IT กรุณารอสักครู่'
    );
  end if;

  return json_build_object(
    'success', true,
    'user', json_build_object(
      'employeeId', emp.employee_id,
      'company',    coalesce(emp.company, ''),
      'firstName',  coalesce(emp.first_name, ''),
      'lastName',   coalesce(emp.last_name, ''),
      'department', coalesce(emp.department, ''),
      'section',    coalesce(emp.section, ''),
      'position',   coalesce(emp.position, ''),
      'nickname',   coalesce(emp.nickname, ''),
      'email',      coalesce(emp.email, ''),
      'phone',      coalesce(emp.phone, ''),
      'isAdmin',    coalesce(emp.is_admin, false)
    )
  );
end;
$body$;

revoke all on function login(text, text) from public;
grant execute on function login(text, text) to anon, authenticated;

-- ===== RPC: register new employee =====

create or replace function register_employee(
  p_emp_id     text,
  p_password   text,
  p_company    text,
  p_first_name text,
  p_last_name  text,
  p_nickname   text,
  p_position   text,
  p_email      text,
  p_phone      text
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  existing employees%rowtype;
begin
  -- Check if employee_id already exists
  select * into existing from employees where employee_id = p_emp_id;
  if found then
    return json_build_object('success', false, 'message', 'รหัสพนักงานนี้มีอยู่ในระบบแล้ว');
  end if;

  insert into employees (
    employee_id, password, company, first_name, last_name,
    nickname, position, email, phone, is_admin, is_approved, registered_at
  ) values (
    p_emp_id, p_password, p_company, p_first_name, p_last_name,
    p_nickname, p_position, p_email, p_phone, false, false, now()
  );

  -- Notify all admins about the new registration
  insert into notifications (employee_id, ticket_no, title, message)
  select employee_id, '',
         'มีพนักงานใหม่ลงทะเบียน',
         p_emp_id || ' — ' || coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, '') || ' (' || coalesce(p_company, '') || ') รออนุมัติ'
  from employees
  where is_admin = true and coalesce(is_approved, true) = true;

  return json_build_object('success', true, 'message', 'ลงทะเบียนสำเร็จ กรุณารอการอนุมัติจากทีม IT');
end;
$body$;

revoke all on function register_employee(text,text,text,text,text,text,text,text,text) from public;
grant execute on function register_employee(text,text,text,text,text,text,text,text,text) to anon, authenticated;

-- ===== RPC: get pending registrations (admin) =====

create or replace function get_pending_registrations()
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  result json;
begin
  select json_agg(row_to_json(t) order by t.registered_at desc) into result
  from (
    select
      employee_id as "employeeId",
      coalesce(first_name, '') as "firstName",
      coalesce(last_name, '') as "lastName",
      coalesce(nickname, '') as "nickname",
      coalesce(company, '') as "company",
      coalesce(position, '') as "position",
      coalesce(email, '') as "email",
      coalesce(phone, '') as "phone",
      registered_at as "registeredAt"
    from employees
    where is_approved = false
      and resigned_date is null
    order by registered_at desc
  ) t;

  return coalesce(result, '[]'::json);
end;
$body$;

revoke all on function get_pending_registrations() from public;
grant execute on function get_pending_registrations() to anon, authenticated;

-- ===== RPC: approve or reject registration (admin) =====

create or replace function approve_registration(
  p_admin_id   text,
  p_admin_pwd  text,
  p_emp_id     text,
  p_action     text  -- 'approve' or 'reject'
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  is_adm boolean;
begin
  select is_admin into is_adm
  from employees
  where employee_id = p_admin_id and password = p_admin_pwd;

  if not coalesce(is_adm, false) then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์ admin');
  end if;

  if p_action = 'approve' then
    update employees set is_approved = true where employee_id = p_emp_id and is_approved = false;
  elsif p_action = 'reject' then
    delete from employees where employee_id = p_emp_id and is_approved = false;
  end if;

  return json_build_object('success', true);
end;
$body$;

revoke all on function approve_registration(text,text,text,text) from public;
grant execute on function approve_registration(text,text,text,text) to anon, authenticated;

-- === schema_v9.sql ===
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

-- === schema_v10.sql ===
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

-- === schema_v11.sql ===
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

-- === schema_v12.sql ===
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

-- === schema_v13.sql ===
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

-- === schema_v14.sql ===
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

-- === schema_v15.sql ===
-- ============================================================
-- Phase 15: User Profile — Avatar, edit personal info, change password
-- ============================================================

-- New column for avatar
alter table employees add column if not exists avatar_url text;

-- Updated login() to also return avatarUrl
create or replace function login(p_emp_id text, p_password text)
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp employees%rowtype;
begin
  select * into emp
  from employees
  where employee_id = p_emp_id
    and password    = p_password;

  if not found then
    return json_build_object(
      'success', false,
      'message', 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง'
    );
  end if;

  if emp.resigned_date is not null then
    return json_build_object(
      'success', false,
      'message', 'บัญชีนี้ถูกปิดการใช้งานแล้ว กรุณาติดต่อฝ่าย IT'
    );
  end if;

  if not coalesce(emp.is_approved, false) then
    return json_build_object(
      'success', false,
      'message', 'บัญชีของคุณยังรอการอนุมัติจากทีม IT กรุณารอสักครู่'
    );
  end if;

  return json_build_object(
    'success', true,
    'user', json_build_object(
      'employeeId', emp.employee_id,
      'company',    coalesce(emp.company, ''),
      'firstName',  coalesce(emp.first_name, ''),
      'lastName',   coalesce(emp.last_name, ''),
      'department', coalesce(emp.department, ''),
      'section',    coalesce(emp.section, ''),
      'position',   coalesce(emp.position, ''),
      'nickname',   coalesce(emp.nickname, ''),
      'email',      coalesce(emp.email, ''),
      'phone',      coalesce(emp.phone, ''),
      'avatarUrl',  coalesce(emp.avatar_url, ''),
      'isAdmin',    coalesce(emp.is_admin, false)
    )
  );
end;
$body$;

grant execute on function login(text, text) to anon, authenticated;

-- ============================================================
-- RPC: update_my_profile — edit nickname / email / phone
-- ============================================================
create or replace function update_my_profile(
  p_emp_id    text,
  p_password  text,
  p_nickname  text,
  p_email     text,
  p_phone     text
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp employees%rowtype;
begin
  select * into emp from employees
  where employee_id = p_emp_id and password = p_password;
  if not found then
    return json_build_object('success', false, 'message', 'รหัสผ่านไม่ถูกต้อง');
  end if;

  update employees
  set
    nickname = nullif(trim(coalesce(p_nickname, '')), ''),
    email    = nullif(trim(coalesce(p_email, '')), ''),
    phone    = nullif(trim(coalesce(p_phone, '')), '')
  where employee_id = p_emp_id;

  return json_build_object(
    'success', true,
    'user', json_build_object(
      'nickname', coalesce(nullif(trim(coalesce(p_nickname, '')), ''), ''),
      'email',    coalesce(nullif(trim(coalesce(p_email, '')), ''), ''),
      'phone',    coalesce(nullif(trim(coalesce(p_phone, '')), ''), '')
    )
  );
end;
$body$;

revoke all on function update_my_profile(text, text, text, text, text) from public;
grant execute on function update_my_profile(text, text, text, text, text) to anon, authenticated;

-- ============================================================
-- RPC: change_my_password — verify old password first
-- ============================================================
create or replace function change_my_password(
  p_emp_id       text,
  p_old_password text,
  p_new_password text
) returns json
language plpgsql
security definer
set search_path = public
as $body$
begin
  if p_new_password is null or length(trim(p_new_password)) < 4 then
    return json_build_object('success', false, 'message', 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร');
  end if;

  if not exists (
    select 1 from employees
    where employee_id = p_emp_id and password = p_old_password
  ) then
    return json_build_object('success', false, 'message', 'รหัสผ่านเดิมไม่ถูกต้อง');
  end if;

  update employees
  set password = p_new_password
  where employee_id = p_emp_id;

  return json_build_object('success', true);
end;
$body$;

revoke all on function change_my_password(text, text, text) from public;
grant execute on function change_my_password(text, text, text) to anon, authenticated;

-- ============================================================
-- RPC: update_my_avatar — save avatar URL
-- ============================================================
create or replace function update_my_avatar(
  p_emp_id     text,
  p_password   text,
  p_avatar_url text
) returns json
language plpgsql
security definer
set search_path = public
as $body$
begin
  if not exists (
    select 1 from employees
    where employee_id = p_emp_id and password = p_password
  ) then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์');
  end if;

  update employees
  set avatar_url = nullif(trim(coalesce(p_avatar_url, '')), '')
  where employee_id = p_emp_id;

  return json_build_object('success', true);
end;
$body$;

revoke all on function update_my_avatar(text, text, text) from public;
grant execute on function update_my_avatar(text, text, text) to anon, authenticated;
