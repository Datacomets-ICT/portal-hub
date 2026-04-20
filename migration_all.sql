-- ============================================================
-- IT Ticket System — Full Migration SQL (v1.0 → v21)
-- ============================================================
-- Generated: merge of schema.sql + schema_v2..v21.sql in order
-- Usage:
--   1) Create new Supabase project
--   2) Open SQL Editor → paste this entire file → Run
--   3) Dashboard > Extensions → enable "pg_cron" (for auto-close)
--   4) Dashboard > Database > Replication → add ticket_messages
--      to supabase_realtime publication (for chat realtime)
--   5) Dashboard > Storage → create bucket "ticket-attachments" (Public)
--
-- Note: Idempotent — safe to re-run. Uses "create or replace" and
-- "if not exists" throughout.
-- ============================================================


-- ============================================================
-- === schema.sql ===
-- ============================================================
-- ============================================================
-- IT Ticket System — Supabase Schema
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- ===== Tables =====

create table if not exists employees (
  employee_id text primary key,
  password    text not null,
  company     text,
  first_name  text,
  last_name   text,
  department  text,
  section     text,
  position    text,
  nickname    text,
  email       text,
  phone       text
);

create table if not exists worklist (
  id         bigserial primary key,
  job_type   text not null,
  issue_type text,
  symptom    text
);

create table if not exists tickets (
  key           bigserial primary key,
  ticket_no     text unique not null,
  created_at    timestamptz not null default now(),
  employee_id   text,
  employee_name text,
  plant         text,
  job_type      text,
  issue_type    text,
  symptom       text,
  detail        text,
  request       text,
  vnc_number    text,
  phone         text,
  status        text default 'เปิด Ticket',
  reply         text,
  admin         text,
  location      text
);

create index if not exists tickets_employee_id_idx on tickets(employee_id);
create index if not exists tickets_created_at_idx  on tickets(created_at desc);

-- ===== Row Level Security =====

alter table employees enable row level security;
alter table worklist  enable row level security;
alter table tickets   enable row level security;

-- employees: NO direct access for anon (only via login() RPC below)
-- (no policies defined = denied)

-- worklist: anon can read
drop policy if exists "worklist_read" on worklist;
create policy "worklist_read" on worklist
  for select to anon using (true);

-- tickets: anon can read & insert (insert is also done via RPC)
drop policy if exists "tickets_read" on tickets;
create policy "tickets_read" on tickets
  for select to anon using (true);

drop policy if exists "tickets_insert" on tickets;
create policy "tickets_insert" on tickets
  for insert to anon with check (true);

-- ===== RPC: login =====
-- SECURITY DEFINER lets this function read employees even though
-- anon has no direct SELECT permission on the table.

create or replace function login(p_emp_id text, p_password text)
returns json
language plpgsql
security definer
set search_path = public
as $$
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
      'phone',      coalesce(emp.phone, '')
    )
  );
end;
$$;

revoke all on function login(text, text) from public;
grant execute on function login(text, text) to anon, authenticated;

-- ===== RPC: create_ticket =====
-- Generates ticket_no atomically as IT + YYMM + 4-digit sequence

create or replace function create_ticket(payload json)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  prefix         text;
  max_seq        int;
  new_seq        int;
  new_ticket_no  text;
begin
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
    vnc_number, phone, location, status
  ) values (
    new_ticket_no,
    payload->>'employeeId',
    payload->>'employeeName',
    payload->>'plant',
    payload->>'jobType',
    payload->>'issueType',
    payload->>'symptom',
    payload->>'request',
    payload->>'vncNumber',
    payload->>'phone',
    payload->>'location',
    'เปิด Ticket'
  );

  return json_build_object('success', true, 'ticketId', new_ticket_no);
end;
$$;

revoke all on function create_ticket(json) from public;
grant execute on function create_ticket(json) to anon, authenticated;

-- ============================================================
-- === schema_v2.sql ===
-- ============================================================
-- ============================================================
-- Phase 2: Image attachments + Admin panel
-- Run this entire file in Supabase SQL Editor
-- (Safe to run multiple times — uses IF NOT EXISTS / OR REPLACE)
-- ============================================================

-- ===== Schema changes =====

alter table employees add column if not exists is_admin boolean not null default false;
alter table tickets   add column if not exists photo_urls text[];

-- Ensure default Admin account exists with password 1234
insert into employees (employee_id, password, company, first_name, last_name, department, section, position, nickname, is_admin)
values ('Admin', '1234', '', 'Admin', '', 'IT', 'IT', 'Administrator', 'Admin', true)
on conflict (employee_id) do update
  set password = '1234', is_admin = true;

-- ===== Storage bucket for ticket images =====

insert into storage.buckets (id, name, public)
values ('ticket-attachments', 'ticket-attachments', true)
on conflict (id) do nothing;

-- Allow anon to upload to and read from the bucket
drop policy if exists "ticket_attachments_anon_insert" on storage.objects;
create policy "ticket_attachments_anon_insert"
  on storage.objects for insert to anon
  with check (bucket_id = 'ticket-attachments');

drop policy if exists "ticket_attachments_anon_read" on storage.objects;
create policy "ticket_attachments_anon_read"
  on storage.objects for select to anon
  using (bucket_id = 'ticket-attachments');

-- ===== Updated login() — also returns is_admin =====

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
      'isAdmin',    emp.is_admin
    )
  );
end;
$body$;

revoke all on function login(text, text) from public;
grant execute on function login(text, text) to anon, authenticated;

-- ===== Updated create_ticket() — accepts photoUrls array =====

create or replace function create_ticket(payload json)
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  prefix         text;
  max_seq        int;
  new_seq        int;
  new_ticket_no  text;
  v_photo_urls   text[];
begin
  prefix := 'IT' || to_char(now(), 'YYMM');

  select coalesce(
           max(substring(ticket_no from length(prefix) + 1)::int),
           0)
  into max_seq
  from tickets
  where ticket_no like prefix || '%'
    and length(ticket_no) > length(prefix)
    and substring(ticket_no from length(prefix) + 1) similar to '[0-9]+';

  new_seq := max_seq + 1;
  new_ticket_no := prefix || lpad(new_seq::text, 4, '0');

  -- Convert payload->photoUrls (json array) into text[]
  if (payload->'photoUrls') is not null
     and json_typeof(payload->'photoUrls') = 'array' then
    select array_agg(value) into v_photo_urls
    from json_array_elements_text(payload->'photoUrls') as value;
  end if;

  insert into tickets (
    ticket_no, employee_id, employee_name, plant,
    job_type, issue_type, symptom, request,
    vnc_number, phone, location, status, photo_urls
  ) values (
    new_ticket_no,
    payload->>'employeeId',
    payload->>'employeeName',
    payload->>'plant',
    payload->>'jobType',
    payload->>'issueType',
    payload->>'symptom',
    payload->>'request',
    payload->>'vncNumber',
    payload->>'phone',
    payload->>'location',
    'เปิด Ticket',
    v_photo_urls
  );

  return json_build_object('success', true, 'ticketId', new_ticket_no);
end;
$body$;

revoke all on function create_ticket(json) from public;
grant execute on function create_ticket(json) to anon, authenticated;

-- ===== NEW: update_ticket() — admin only =====
-- Verifies caller is admin (employee_id + password) before updating.

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
  is_adm boolean;
  tid    bigint;
begin
  -- Verify admin
  select is_admin into is_adm
  from employees
  where employee_id = p_emp_id and password = p_password;

  if not coalesce(is_adm, false) then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์ admin');
  end if;

  tid := (payload->>'key')::bigint;

  update tickets set
    status = coalesce(nullif(payload->>'status', ''), status),
    reply  = coalesce(payload->>'reply',  reply),
    admin  = coalesce(payload->>'admin',  admin)
  where key = tid;

  if not found then
    return json_build_object('success', false, 'message', 'ไม่พบ ticket');
  end if;

  return json_build_object('success', true);
end;
$body$;

revoke all on function update_ticket(text, text, json) from public;
grant execute on function update_ticket(text, text, json) to anon, authenticated;

-- ============================================================
-- === schema_v3.sql ===
-- ============================================================
-- ============================================================
-- Phase 3: Admin assignee dropdown + plant filter support
-- Run this entire file in Supabase SQL Editor
-- (Safe to re-run)
-- ============================================================

-- ===== get_assignees() — list of IT staff (admins) =====
-- Returns only safe fields, no password.
-- Used by the admin edit modal to populate the "ผู้รับผิดชอบ" dropdown.

create or replace function get_assignees()
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  result json;
begin
  select json_agg(row_to_json(t) order by t.employee_id) into result
  from (
    select
      employee_id                                 as "employeeId",
      coalesce(first_name, '')                    as "firstName",
      coalesce(last_name, '')                     as "lastName",
      coalesce(nickname, '')                      as "nickname",
      coalesce(department, '')                    as "department"
    from employees
    where is_admin = true
    order by employee_id
  ) t;

  return coalesce(result, '[]'::json);
end;
$body$;

revoke all on function get_assignees() from public;
grant execute on function get_assignees() to anon, authenticated;

-- ============================================================
-- === schema_v4.sql ===
-- ============================================================
-- ============================================================
-- Phase 4: File attachments + Audit history
-- Run this entire file in Supabase SQL Editor (safe to re-run)
-- ============================================================

-- ===== Schema changes =====

-- file_urls: jsonb array of {name, url, type, size}
alter table tickets add column if not exists file_urls jsonb default '[]'::jsonb;

-- Audit history table
create table if not exists ticket_history (
  id              bigserial primary key,
  ticket_key      bigint not null,
  ticket_no       text,
  changed_at      timestamptz not null default now(),
  changed_by_id   text,
  changed_by_name text,
  field           text not null,
  old_value       text,
  new_value       text
);

create index if not exists ticket_history_ticket_key_idx
  on ticket_history(ticket_key);
create index if not exists ticket_history_changed_at_idx
  on ticket_history(changed_at desc);

alter table ticket_history enable row level security;

drop policy if exists "history_read" on ticket_history;
create policy "history_read" on ticket_history
  for select to anon using (true);

-- ===== Updated update_ticket() — also writes history =====

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
begin
  -- Verify admin
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

  -- Write history rows for changed fields
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

  update tickets set
    status = new_status,
    admin  = new_admin,
    reply  = new_reply
  where key = tid;

  return json_build_object('success', true);
end;
$body$;

revoke all on function update_ticket(text, text, json) from public;
grant execute on function update_ticket(text, text, json) to anon, authenticated;

-- ===== get_ticket_history() =====

create or replace function get_ticket_history(p_ticket_key bigint)
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  result json;
begin
  select json_agg(row_to_json(t) order by t.changed_at desc) into result
  from (
    select
      id,
      changed_at      as "changedAt",
      changed_by_id   as "changedById",
      changed_by_name as "changedByName",
      field,
      old_value       as "oldValue",
      new_value       as "newValue"
    from ticket_history
    where ticket_key = p_ticket_key
    order by changed_at desc
  ) t;

  return coalesce(result, '[]'::json);
end;
$body$;

revoke all on function get_ticket_history(bigint) from public;
grant execute on function get_ticket_history(bigint) to anon, authenticated;

-- ===== Updated create_ticket() — accept fileUrls jsonb =====

create or replace function create_ticket(payload json)
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  prefix         text;
  max_seq        int;
  new_seq        int;
  new_ticket_no  text;
  v_photo_urls   text[];
  v_file_urls    jsonb;
begin
  prefix := 'IT' || to_char(now(), 'YYMM');

  select coalesce(
           max(substring(ticket_no from length(prefix) + 1)::int),
           0)
  into max_seq
  from tickets
  where ticket_no like prefix || '%'
    and length(ticket_no) > length(prefix)
    and substring(ticket_no from length(prefix) + 1) similar to '[0-9]+';

  new_seq := max_seq + 1;
  new_ticket_no := prefix || lpad(new_seq::text, 4, '0');

  -- Convert payload->photoUrls (json array) into text[]
  if (payload->'photoUrls') is not null
     and json_typeof(payload->'photoUrls') = 'array' then
    select array_agg(value) into v_photo_urls
    from json_array_elements_text(payload->'photoUrls') as value;
  end if;

  -- fileUrls is stored as jsonb
  if (payload->'fileUrls') is not null
     and json_typeof(payload->'fileUrls') = 'array' then
    v_file_urls := (payload->'fileUrls')::jsonb;
  else
    v_file_urls := '[]'::jsonb;
  end if;

  insert into tickets (
    ticket_no, employee_id, employee_name, plant,
    job_type, issue_type, symptom, request,
    vnc_number, phone, location, status, photo_urls, file_urls
  ) values (
    new_ticket_no,
    payload->>'employeeId',
    payload->>'employeeName',
    payload->>'plant',
    payload->>'jobType',
    payload->>'issueType',
    payload->>'symptom',
    payload->>'request',
    payload->>'vncNumber',
    payload->>'phone',
    payload->>'location',
    'เปิด Ticket',
    v_photo_urls,
    v_file_urls
  );

  return json_build_object('success', true, 'ticketId', new_ticket_no);
end;
$body$;

revoke all on function create_ticket(json) from public;
grant execute on function create_ticket(json) to anon, authenticated;

-- ============================================================
-- === schema_v5.sql ===
-- ============================================================
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

-- ============================================================
-- === schema_v6.sql ===
-- ============================================================
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

-- ============================================================
-- === schema_v7.sql ===
-- ============================================================
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

-- ============================================================
-- === schema_v8.sql ===
-- ============================================================
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

-- ============================================================
-- === schema_v9.sql ===
-- ============================================================
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

-- ============================================================
-- === schema_v10.sql ===
-- ============================================================
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

-- ============================================================
-- === schema_v11.sql ===
-- ============================================================
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

-- ============================================================
-- === schema_v12.sql ===
-- ============================================================
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

-- ============================================================
-- === schema_v13.sql ===
-- ============================================================
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

-- ============================================================
-- === schema_v14.sql ===
-- ============================================================
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

-- ============================================================
-- === schema_v15.sql ===
-- ============================================================
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

-- ============================================================
-- === schema_v16.sql ===
-- ============================================================
-- ============================================================
-- Phase 16: Priority + SLA (business hours) + User confirm/reopen
-- ============================================================

-- ===== New columns =====
alter table tickets add column if not exists priority text default 'medium';
alter table tickets add column if not exists due_at   timestamptz;

-- ===== SLA config table =====
create table if not exists sla_config (
  priority  text primary key,
  hours     numeric not null,
  label_th  text,
  color     text
);

insert into sla_config (priority, hours, label_th, color) values
  ('urgent', 2,  'ด่วนมาก', '#EF4444'),
  ('high',   4,  'สำคัญ',   '#F97316'),
  ('medium', 8,  'ปกติ',    '#EAB308'),
  ('low',    24, 'ไม่เร่ง',  '#22C55E')
on conflict (priority) do update set
  hours    = excluded.hours,
  label_th = excluded.label_th,
  color    = excluded.color;

alter table sla_config enable row level security;
drop policy if exists "sla_config_read" on sla_config;
create policy "sla_config_read" on sla_config for select to anon using (true);

-- ============================================================
-- Business hours due-at calculator (Mon–Fri 08:00–17:00 Asia/Bangkok)
-- ============================================================
create or replace function calc_business_due_at(
  start_ts  timestamptz,
  hours_num numeric
) returns timestamptz
language plpgsql
immutable
as $body$
declare
  tz text := 'Asia/Bangkok';
  remaining_min int;
  cur_local timestamp;
  dow int;          -- 1=Mon ... 7=Sun
  hod int;
  min_to_end int;
begin
  remaining_min := (hours_num * 60)::int;
  cur_local     := start_ts at time zone tz;

  while remaining_min > 0 loop
    dow := extract(isodow from cur_local);
    hod := extract(hour   from cur_local);

    -- Saturday -> next Monday 08:00
    if dow = 6 then
      cur_local := date_trunc('day', cur_local) + interval '2 day' + interval '8 hour';
      continue;
    end if;
    -- Sunday -> next Monday 08:00
    if dow = 7 then
      cur_local := date_trunc('day', cur_local) + interval '1 day' + interval '8 hour';
      continue;
    end if;
    -- Before 08:00 -> today 08:00
    if hod < 8 then
      cur_local := date_trunc('day', cur_local) + interval '8 hour';
      continue;
    end if;
    -- After 17:00 -> next business day 08:00
    if hod >= 17 then
      if dow = 5 then   -- Friday -> Monday
        cur_local := date_trunc('day', cur_local) + interval '3 day' + interval '8 hour';
      else
        cur_local := date_trunc('day', cur_local) + interval '1 day' + interval '8 hour';
      end if;
      continue;
    end if;

    -- Inside business window
    min_to_end := extract(epoch from ((date_trunc('day', cur_local) + interval '17 hour') - cur_local))::int / 60;

    if min_to_end >= remaining_min then
      return (cur_local + (remaining_min || ' minutes')::interval) at time zone tz;
    end if;

    remaining_min := remaining_min - min_to_end;
    cur_local     := date_trunc('day', cur_local) + interval '17 hour';
  end loop;

  return cur_local at time zone tz;
end;
$body$;

-- ============================================================
-- Trigger: set due_at on insert / priority change
-- ============================================================
create or replace function trg_set_ticket_due_at()
returns trigger language plpgsql as $body$
declare
  sla_hours numeric;
begin
  select hours into sla_hours from sla_config where priority = NEW.priority;
  if sla_hours is null then sla_hours := 8; end if;
  NEW.due_at := calc_business_due_at(coalesce(NEW.created_at, now()), sla_hours);
  return NEW;
end;
$body$;

drop trigger if exists ticket_set_due_at on tickets;
create trigger ticket_set_due_at
before insert on tickets
for each row execute function trg_set_ticket_due_at();

create or replace function trg_update_ticket_due_at()
returns trigger language plpgsql as $body$
declare
  sla_hours numeric;
begin
  if NEW.priority is distinct from OLD.priority then
    select hours into sla_hours from sla_config where priority = NEW.priority;
    if sla_hours is null then sla_hours := 8; end if;
    NEW.due_at := calc_business_due_at(NEW.created_at, sla_hours);
  end if;
  return NEW;
end;
$body$;

drop trigger if exists ticket_update_due_at on tickets;
create trigger ticket_update_due_at
before update on tickets
for each row execute function trg_update_ticket_due_at();

-- Backfill for existing rows (one-time)
update tickets
set priority = coalesce(priority, 'medium')
where priority is null or priority = '';

update tickets
set due_at = calc_business_due_at(created_at, (select hours from sla_config where priority = coalesce(tickets.priority, 'medium')))
where due_at is null;

-- ============================================================
-- Updated create_ticket (accepts priority)
-- ============================================================
create or replace function create_ticket(payload json)
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  prefix         text;
  max_seq        int;
  new_seq        int;
  new_ticket_no  text;
  new_priority   text;
begin
  prefix := 'IT' || to_char(now(), 'YYMM');

  select coalesce(max(substring(ticket_no from length(prefix) + 1)::int), 0)
    into max_seq
  from tickets
  where ticket_no like prefix || '%'
    and substring(ticket_no from length(prefix) + 1) similar to '[0-9]+';

  new_seq       := max_seq + 1;
  new_ticket_no := prefix || lpad(new_seq::text, 4, '0');
  new_priority  := coalesce(nullif(payload->>'priority', ''), 'medium');

  insert into tickets (
    ticket_no, employee_id, employee_name, plant,
    job_type, issue_type, symptom, request,
    vnc_number, phone, location, status, priority
  ) values (
    new_ticket_no,
    payload->>'employeeId',
    payload->>'employeeName',
    payload->>'plant',
    payload->>'jobType',
    payload->>'issueType',
    payload->>'symptom',
    payload->>'request',
    payload->>'vncNumber',
    payload->>'phone',
    payload->>'location',
    'เปิด Ticket',
    new_priority
  );

  return json_build_object('success', true, 'ticketId', new_ticket_no);
end;
$body$;

grant execute on function create_ticket(json) to anon, authenticated;

-- ============================================================
-- Updated update_ticket (admin can change priority too)
-- ============================================================
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
  new_status   text;
  new_admin    text;
  new_reply    text;
  new_priority text;
  admin_label  text;
  notif_msg    text;
begin
  select * into emp from employees
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

  new_status   := coalesce(nullif(payload->>'status',   ''), old_row.status);
  new_admin    := coalesce(payload->>'admin',    old_row.admin);
  new_reply    := coalesce(payload->>'reply',    old_row.reply);
  new_priority := coalesce(nullif(payload->>'priority', ''), old_row.priority);

  admin_label := trim(coalesce(emp.first_name, '') || ' ' || coalesce(emp.last_name, ''));
  if admin_label = '' then admin_label := emp.employee_id; end if;

  -- History
  if coalesce(old_row.status,   '') <> coalesce(new_status,   '') then
    insert into ticket_history (ticket_key, ticket_no, changed_by_id, changed_by_name, field, old_value, new_value)
    values (tid, old_row.ticket_no, emp.employee_id, admin_label, 'status', old_row.status, new_status);
  end if;
  if coalesce(old_row.admin,    '') <> coalesce(new_admin,    '') then
    insert into ticket_history (ticket_key, ticket_no, changed_by_id, changed_by_name, field, old_value, new_value)
    values (tid, old_row.ticket_no, emp.employee_id, admin_label, 'admin', old_row.admin, new_admin);
  end if;
  if coalesce(old_row.reply,    '') <> coalesce(new_reply,    '') then
    insert into ticket_history (ticket_key, ticket_no, changed_by_id, changed_by_name, field, old_value, new_value)
    values (tid, old_row.ticket_no, emp.employee_id, admin_label, 'reply', old_row.reply, new_reply);
  end if;
  if coalesce(old_row.priority, '') <> coalesce(new_priority, '') then
    insert into ticket_history (ticket_key, ticket_no, changed_by_id, changed_by_name, field, old_value, new_value)
    values (tid, old_row.ticket_no, emp.employee_id, admin_label, 'priority', old_row.priority, new_priority);
  end if;

  update tickets set
    status   = new_status,
    admin    = new_admin,
    reply    = new_reply,
    priority = new_priority
  where key = tid;

  -- Notification
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
      values (old_row.employee_id, old_row.ticket_no,
              'Ticket ' || old_row.ticket_no || ' มีการอัพเดท', notif_msg);
    end if;
  end if;

  return json_build_object('success', true);
end;
$body$;

grant execute on function update_ticket(text, text, json) to anon, authenticated;

-- ============================================================
-- RPC: confirm_ticket_closed (user signs off)
-- ============================================================
create or replace function confirm_ticket_closed(
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
  user_label text;
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

  if t.employee_id <> p_emp_id then
    return json_build_object('success', false, 'message', 'ยืนยันได้เฉพาะ Ticket ของตัวเอง');
  end if;

  if t.status <> 'ดำเนินการเรียบร้อย' then
    return json_build_object('success', false,
      'message', 'ยืนยันได้เฉพาะ Ticket ที่ IT ดำเนินการเรียบร้อยแล้ว');
  end if;

  user_label := trim(coalesce(emp.first_name, '') || ' ' || coalesce(emp.last_name, ''));
  if user_label = '' then user_label := emp.employee_id; end if;

  update tickets set status = 'ปิดงานแล้ว' where key = p_ticket_key;

  insert into ticket_history (ticket_key, ticket_no, changed_by_id, changed_by_name, field, old_value, new_value)
  values (p_ticket_key, t.ticket_no, emp.employee_id, user_label,
          'status', t.status, 'ปิดงานแล้ว');

  -- Notify the admin who worked on it
  if t.admin is not null and t.admin <> '' then
    insert into notifications (employee_id, ticket_no, title, message)
    select employee_id, t.ticket_no,
           'Ticket ' || t.ticket_no || ' ถูกปิดโดยผู้แจ้ง',
           user_label || ' ยืนยันว่างานเสร็จแล้ว'
    from employees
    where is_admin = true
    limit 20;
  end if;

  return json_build_object('success', true);
end;
$body$;

revoke all on function confirm_ticket_closed(text, text, bigint) from public;
grant execute on function confirm_ticket_closed(text, text, bigint) to anon, authenticated;

-- ============================================================
-- RPC: reopen_my_ticket (user reopens with reason)
-- ============================================================
create or replace function reopen_my_ticket(
  p_emp_id     text,
  p_password   text,
  p_ticket_key bigint,
  p_reason     text
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp employees%rowtype;
  t   tickets%rowtype;
  user_label text;
  reason_txt text;
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

  if t.employee_id <> p_emp_id then
    return json_build_object('success', false, 'message', 'เปิดใหม่ได้เฉพาะ Ticket ของตัวเอง');
  end if;

  if t.status <> 'ดำเนินการเรียบร้อย' then
    return json_build_object('success', false,
      'message', 'เปิดใหม่ได้เฉพาะ Ticket ที่ IT ดำเนินการเรียบร้อยแล้ว');
  end if;

  reason_txt := trim(coalesce(p_reason, ''));
  if reason_txt = '' then
    return json_build_object('success', false, 'message', 'กรุณาระบุเหตุผลในการเปิดใหม่');
  end if;

  user_label := trim(coalesce(emp.first_name, '') || ' ' || coalesce(emp.last_name, ''));
  if user_label = '' then user_label := emp.employee_id; end if;

  update tickets set status = 'เปิด Ticket' where key = p_ticket_key;

  insert into ticket_history (ticket_key, ticket_no, changed_by_id, changed_by_name, field, old_value, new_value)
  values (p_ticket_key, t.ticket_no, emp.employee_id, user_label,
          'status', 'ดำเนินการเรียบร้อย',
          'เปิด Ticket (เปิดใหม่: ' || reason_txt || ')');

  -- Notify admins
  insert into notifications (employee_id, ticket_no, title, message)
  select employee_id, t.ticket_no,
         'Ticket ' || t.ticket_no || ' ถูกเปิดใหม่',
         user_label || ': ' || reason_txt
  from employees
  where is_admin = true
  limit 20;

  return json_build_object('success', true);
end;
$body$;

revoke all on function reopen_my_ticket(text, text, bigint, text) from public;
grant execute on function reopen_my_ticket(text, text, bigint, text) to anon, authenticated;

-- ============================================================
-- === schema_v17.sql ===
-- ============================================================
-- ============================================================
-- Phase 17: Auto-close stale tickets (7 days after "ดำเนินการเรียบร้อย")
-- ============================================================

-- Add resolved_at column to track when IT finished work
alter table tickets add column if not exists resolved_at timestamptz;

-- Trigger: set/clear resolved_at when status transitions
create or replace function trg_set_resolved_at()
returns trigger language plpgsql as $body$
begin
  if TG_OP = 'INSERT' then
    if NEW.status = 'ดำเนินการเรียบร้อย' then
      NEW.resolved_at := now();
    end if;
  elsif TG_OP = 'UPDATE' then
    if NEW.status = 'ดำเนินการเรียบร้อย'
       and OLD.status is distinct from 'ดำเนินการเรียบร้อย' then
      NEW.resolved_at := now();
    elsif NEW.status is distinct from 'ดำเนินการเรียบร้อย'
          and OLD.status = 'ดำเนินการเรียบร้อย' then
      NEW.resolved_at := null;
    end if;
  end if;
  return NEW;
end;
$body$;

drop trigger if exists ticket_set_resolved_at on tickets;
create trigger ticket_set_resolved_at
before insert or update on tickets
for each row execute function trg_set_resolved_at();

-- Backfill: existing "ดำเนินการเรียบร้อย" tickets get 7 more days from now
-- (so users who are mid-transition won't suddenly lose tickets)
update tickets
set resolved_at = now()
where status = 'ดำเนินการเรียบร้อย' and resolved_at is null;

-- ============================================================
-- Auto-close function: closes tickets resolved >7 days ago
-- ============================================================
create or replace function auto_close_stale_tickets()
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  closed_count int := 0;
  ticket_rec   tickets%rowtype;
begin
  for ticket_rec in
    select * from tickets
    where status = 'ดำเนินการเรียบร้อย'
      and resolved_at is not null
      and resolved_at < now() - interval '7 days'
  loop
    update tickets
    set status = 'ปิดงานแล้ว'
    where key = ticket_rec.key;

    insert into ticket_history (
      ticket_key, ticket_no, changed_by_id, changed_by_name,
      field, old_value, new_value
    ) values (
      ticket_rec.key, ticket_rec.ticket_no, 'SYSTEM', 'ระบบปิดอัตโนมัติ',
      'status', 'ดำเนินการเรียบร้อย', 'ปิดงานแล้ว (auto-close หลัง 7 วัน)'
    );

    -- Notify the user
    if ticket_rec.employee_id is not null and ticket_rec.employee_id <> '' then
      insert into notifications (employee_id, ticket_no, title, message)
      values (
        ticket_rec.employee_id,
        ticket_rec.ticket_no,
        'Ticket ' || ticket_rec.ticket_no || ' ปิดอัตโนมัติ',
        'ปิดอัตโนมัติเนื่องจากไม่มีการยืนยันภายใน 7 วัน · หากปัญหายังอยู่สามารถเปิดใหม่ได้'
      );
    end if;

    closed_count := closed_count + 1;
  end loop;

  return json_build_object('success', true, 'closed_count', closed_count);
end;
$body$;

grant execute on function auto_close_stale_tickets() to anon, authenticated;

-- ============================================================
-- Schedule: run daily at 02:00 Asia/Bangkok (= 19:00 UTC previous day)
-- NOTE: pg_cron must be enabled first. In Supabase Dashboard:
--   Database > Extensions > search "pg_cron" > Enable
-- Or via SQL (requires superuser):
--   create extension if not exists pg_cron with schema extensions;
-- ============================================================

-- Remove old schedule if re-running
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('auto-close-stale-tickets-daily')
    where exists (select 1 from cron.job where jobname = 'auto-close-stale-tickets-daily');

    perform cron.schedule(
      'auto-close-stale-tickets-daily',
      '0 19 * * *',   -- 19:00 UTC = 02:00 Bangkok
      $job$select auto_close_stale_tickets();$job$
    );
  else
    raise notice 'pg_cron not enabled — schedule skipped. Enable via Dashboard > Extensions > pg_cron, then rerun this block.';
  end if;
end $$;

-- ============================================================
-- === schema_v18.sql ===
-- ============================================================
-- ============================================================
-- Phase 18: Paginated ticket fetch + tighten RLS
-- ============================================================

-- ============================================================
-- Main RPC: get_tickets_paginated
-- Returns { success, counts, filtered_total, tickets }
-- counts = per-status counts across ALL visible tickets (for summary cards)
-- filtered_total = count matching current filters (for "Load More" logic)
-- tickets = paginated slice sorted priority DESC then created_at DESC
-- ============================================================
create or replace function get_tickets_paginated(
  p_emp_id   text,
  p_password text,
  p_limit    int default 100,
  p_offset   int default 0,
  p_status   text default null,
  p_search   text default null,
  p_plant    text default null
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp        employees%rowtype;
  is_adm     boolean;
  search_pat text;
  result     json;
begin
  select * into emp from employees
  where employee_id = p_emp_id and password = p_password;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์');
  end if;

  is_adm     := coalesce(emp.is_admin, false);
  search_pat := case when p_search is null or p_search = '' then null
                     else '%' || lower(p_search) || '%' end;

  select json_build_object(
    'success', true,
    'counts', (
      select json_build_object(
        'total',       count(*),
        'open',        count(*) filter (where t.status = 'เปิด Ticket'),
        'inprogress',  count(*) filter (where t.status = 'กำลังดำเนินการ'),
        'approve',     count(*) filter (where t.status = 'ต้องการ Approve'),
        'resolved',    count(*) filter (where t.status = 'ดำเนินการเรียบร้อย'),
        'closed',      count(*) filter (where t.status = 'ปิดงานแล้ว'),
        'cancelled',   count(*) filter (where t.status = 'ยกเลิก')
      )
      from tickets t
      where (is_adm or t.employee_id = p_emp_id)
    ),
    'filtered_total', (
      select count(*) from tickets t
      where (is_adm or t.employee_id = p_emp_id)
        and (p_status is null or p_status = '' or p_status = 'all' or t.status = p_status)
        and (p_plant  is null or p_plant  = '' or t.plant  = p_plant)
        and (search_pat is null or
             lower(coalesce(t.ticket_no, '')) like search_pat or
             lower(coalesce(t.employee_name, '')) like search_pat or
             lower(coalesce(t.employee_id, '')) like search_pat or
             lower(coalesce(t.job_type, '')) like search_pat or
             lower(coalesce(t.issue_type, '')) like search_pat or
             lower(coalesce(t.symptom, '')) like search_pat or
             lower(coalesce(t.request, '')) like search_pat or
             lower(coalesce(t.detail, '')) like search_pat or
             lower(coalesce(t.admin, '')) like search_pat or
             lower(coalesce(t.location, '')) like search_pat or
             lower(coalesce(t.vnc_number, '')) like search_pat)
    ),
    'tickets', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json)
      from (
        select key, ticket_no, created_at, employee_id, employee_name,
               plant, job_type, issue_type, symptom, detail, request,
               vnc_number, phone, status, reply, admin, location,
               priority, due_at, resolved_at, photo_urls, file_urls
        from tickets t
        where (is_adm or t.employee_id = p_emp_id)
          and (p_status is null or p_status = '' or p_status = 'all' or t.status = p_status)
          and (p_plant  is null or p_plant  = '' or t.plant  = p_plant)
          and (search_pat is null or
               lower(coalesce(t.ticket_no, '')) like search_pat or
               lower(coalesce(t.employee_name, '')) like search_pat or
               lower(coalesce(t.employee_id, '')) like search_pat or
               lower(coalesce(t.job_type, '')) like search_pat or
               lower(coalesce(t.issue_type, '')) like search_pat or
               lower(coalesce(t.symptom, '')) like search_pat or
               lower(coalesce(t.request, '')) like search_pat or
               lower(coalesce(t.detail, '')) like search_pat or
               lower(coalesce(t.admin, '')) like search_pat or
               lower(coalesce(t.location, '')) like search_pat or
               lower(coalesce(t.vnc_number, '')) like search_pat)
        order by
          case coalesce(priority, 'medium')
            when 'urgent' then 0
            when 'high'   then 1
            when 'medium' then 2
            when 'low'    then 3
            else 9
          end,
          created_at desc
        limit greatest(1, least(p_limit, 500))
        offset greatest(0, p_offset)
      ) x
    )
  ) into result;

  return result;
end;
$body$;

revoke all on function get_tickets_paginated(text, text, int, int, text, text, text) from public;
grant execute on function get_tickets_paginated(text, text, int, int, text, text, text) to anon, authenticated;

-- ============================================================
-- Smaller RPCs for the few other direct-table-access spots
-- ============================================================

-- Distinct plants for ticket form dropdown
create or replace function get_plants_list()
returns json language plpgsql security definer set search_path = public
as $body$
begin
  return coalesce((
    select json_agg(plant order by plant)
    from (select distinct plant from tickets where plant is not null and plant <> '') p
  ), '[]'::json);
end;
$body$;
grant execute on function get_plants_list() to anon, authenticated;

-- Admin-only: tickets still open + unassigned (for notif panel)
create or replace function get_unassigned_tickets(p_emp_id text, p_password text)
returns json language plpgsql security definer set search_path = public
as $body$
declare
  emp employees%rowtype;
begin
  select * into emp from employees
  where employee_id = p_emp_id and password = p_password;
  if not found or not coalesce(emp.is_admin, false) then
    return '[]'::json;
  end if;
  return coalesce((
    select json_agg(row_to_json(t))
    from (
      select ticket_no, created_at, employee_name, request, symptom
      from tickets
      where status = 'เปิด Ticket' and (admin is null or admin = '')
      order by created_at desc
      limit 10
    ) t
  ), '[]'::json);
end;
$body$;
grant execute on function get_unassigned_tickets(text, text) to anon, authenticated;

-- Brief ticket info by keys (for chat-list enrichment)
create or replace function get_tickets_brief(p_emp_id text, p_password text, p_keys bigint[])
returns json language plpgsql security definer set search_path = public
as $body$
declare
  emp employees%rowtype;
  is_adm boolean;
begin
  select * into emp from employees where employee_id = p_emp_id and password = p_password;
  if not found then return '[]'::json; end if;
  is_adm := coalesce(emp.is_admin, false);
  return coalesce((
    select json_agg(row_to_json(t))
    from (
      select key, ticket_no, employee_name, status
      from tickets
      where key = any(p_keys)
        and (is_adm or employee_id = p_emp_id)
    ) t
  ), '[]'::json);
end;
$body$;
grant execute on function get_tickets_brief(text, text, bigint[]) to anon, authenticated;

-- ============================================================
-- Tighten RLS: remove permissive policies on tickets
-- (worklist stays readable — non-sensitive reference data)
-- All ticket access now goes through SECURITY DEFINER RPCs
-- ============================================================
drop policy if exists "tickets_read"   on tickets;
drop policy if exists "tickets_insert" on tickets;
-- intentionally leave tickets without read/insert policies for anon;
-- RLS enabled + no policies = no direct access for anon key
-- RPC functions use SECURITY DEFINER so they still work

-- Keep worklist readable (labels only)
drop policy if exists "worklist_read"     on worklist;
drop policy if exists "worklist_read_all" on worklist;
create policy "worklist_read_all" on worklist for select to anon using (true);

-- ============================================================
-- === schema_v19.sql ===
-- ============================================================
-- ============================================================
-- Phase 19: Supabase Realtime for chat messages
-- ============================================================
-- Scope decision:
--   - chat messages  : REALTIME (instant UX; less sensitive than ticket metadata)
--   - ticket rows    : still behind RPC (30s polling stays)
--   - notifications  : 30s polling stays (low-frequency)
--
-- Trade-off: enabling Realtime requires RLS SELECT policy on the
-- subscribed table, which also re-opens direct REST SELECT on that
-- table. We accept this only for ticket_messages (chat text), not
-- for tickets themselves.
-- ============================================================

-- Add ticket_messages to the realtime publication (safe to re-run)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'ticket_messages'
  ) then
    execute 'alter publication supabase_realtime add table ticket_messages';
  end if;
end $$;

-- Narrow SELECT policy so Realtime can broadcast to subscribers
alter table ticket_messages enable row level security;
drop policy if exists "ticket_messages_realtime" on ticket_messages;
create policy "ticket_messages_realtime"
  on ticket_messages for select to anon using (true);

-- Note: Supabase Realtime will broadcast INSERT/UPDATE/DELETE events
-- The frontend subscribes with filter: ticket_key=eq.<specific_key>
-- so clients only receive events for the ticket they're viewing.

-- ============================================================
-- === schema_v20.sql ===
-- ============================================================
-- ============================================================
-- Phase 20: Quick contact popup for chat list
-- ============================================================

-- Fetch email/phone of the ticket owner + assigned admin
-- Authorized: ticket owner or any admin
-- Admin field format is "{employee_id}_{nickname}" — split to find the admin record
create or replace function get_ticket_contacts(
  p_emp_id     text,
  p_password   text,
  p_ticket_key bigint
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  caller    employees%rowtype;
  is_adm    boolean;
  t         tickets%rowtype;
  owner_emp employees%rowtype;
  admin_emp employees%rowtype;
  admin_id  text;
begin
  select * into caller from employees
  where employee_id = p_emp_id and password = p_password;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์');
  end if;
  is_adm := coalesce(caller.is_admin, false);

  select * into t from tickets where key = p_ticket_key;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่พบ ticket');
  end if;

  if not is_adm and t.employee_id <> p_emp_id then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์ดูข้อมูลติดต่อ');
  end if;

  select * into owner_emp from employees where employee_id = t.employee_id;

  if t.admin is not null and t.admin <> '' then
    admin_id := split_part(t.admin, '_', 1);
    select * into admin_emp from employees where employee_id = admin_id;
  end if;

  return json_build_object(
    'success', true,
    'owner', case when owner_emp.employee_id is not null then
      json_build_object(
        'employeeId', owner_emp.employee_id,
        'firstName',  coalesce(owner_emp.first_name, ''),
        'lastName',   coalesce(owner_emp.last_name, ''),
        'nickname',   coalesce(owner_emp.nickname, ''),
        'department', coalesce(owner_emp.department, ''),
        'section',    coalesce(owner_emp.section, ''),
        'position',   coalesce(owner_emp.position, ''),
        'email',      coalesce(owner_emp.email, ''),
        'phone',      coalesce(owner_emp.phone, ''),
        'lineId',     coalesce(owner_emp.line_id, ''),
        'avatarUrl',  coalesce(owner_emp.avatar_url, '')
      )
    else null end,
    'admin', case when admin_emp.employee_id is not null then
      json_build_object(
        'employeeId', admin_emp.employee_id,
        'firstName',  coalesce(admin_emp.first_name, ''),
        'lastName',   coalesce(admin_emp.last_name, ''),
        'nickname',   coalesce(admin_emp.nickname, ''),
        'department', coalesce(admin_emp.department, ''),
        'section',    coalesce(admin_emp.section, ''),
        'position',   coalesce(admin_emp.position, ''),
        'email',      coalesce(admin_emp.email, ''),
        'phone',      coalesce(admin_emp.phone, ''),
        'avatarUrl',  coalesce(admin_emp.avatar_url, '')
      )
    else null end
  );
end;
$body$;

revoke all on function get_ticket_contacts(text, text, bigint) from public;
grant execute on function get_ticket_contacts(text, text, bigint) to anon, authenticated;

-- ============================================================
-- === schema_v21.sql ===
-- ============================================================
-- ============================================================
-- Phase 21: LINE ID + advanced ticket filters + admin photo upload + dashboard
-- ============================================================

-- LINE ID column
alter table employees add column if not exists line_id text;

-- Admin reply photos (photos attached by admin when resolving)
alter table tickets add column if not exists reply_photo_urls text[];

-- Updated login() to include lineId
create or replace function login(p_emp_id text, p_password text)
returns json
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
    return json_build_object('success', false, 'message', 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง');
  end if;
  if emp.resigned_date is not null then
    return json_build_object('success', false, 'message', 'บัญชีนี้ถูกปิดการใช้งานแล้ว');
  end if;
  if not coalesce(emp.is_approved, false) then
    return json_build_object('success', false, 'message', 'บัญชีของคุณยังรอการอนุมัติจากทีม IT');
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
      'lineId',     coalesce(emp.line_id, ''),
      'avatarUrl',  coalesce(emp.avatar_url, ''),
      'isAdmin',    coalesce(emp.is_admin, false)
    )
  );
end;
$body$;
grant execute on function login(text, text) to anon, authenticated;

-- Updated update_my_profile to include lineId
create or replace function update_my_profile(
  p_emp_id    text,
  p_password  text,
  p_nickname  text,
  p_email     text,
  p_phone     text,
  p_line_id   text default null
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
  update employees set
    nickname = nullif(trim(coalesce(p_nickname, '')), ''),
    email    = nullif(trim(coalesce(p_email, '')), ''),
    phone    = nullif(trim(coalesce(p_phone, '')), ''),
    line_id  = nullif(trim(coalesce(p_line_id, '')), '')
  where employee_id = p_emp_id;
  return json_build_object('success', true);
end;
$body$;
grant execute on function update_my_profile(text, text, text, text, text, text) to anon, authenticated;

-- Updated get_tickets_paginated with admin filter + date range
create or replace function get_tickets_paginated(
  p_emp_id    text,
  p_password  text,
  p_limit     int default 100,
  p_offset    int default 0,
  p_status    text default null,
  p_search    text default null,
  p_plant     text default null,
  p_admin     text default null,
  p_date_from text default null,
  p_date_to   text default null
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp        employees%rowtype;
  is_adm     boolean;
  search_pat text;
  d_from     timestamptz;
  d_to       timestamptz;
  result     json;
begin
  select * into emp from employees
  where employee_id = p_emp_id and password = p_password;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์');
  end if;

  is_adm     := coalesce(emp.is_admin, false);
  search_pat := case when p_search is null or p_search = '' then null
                     else '%' || lower(p_search) || '%' end;
  d_from     := case when p_date_from is not null and p_date_from <> '' then p_date_from::timestamptz else null end;
  d_to       := case when p_date_to   is not null and p_date_to   <> '' then (p_date_to::date + 1)::timestamptz else null end;

  select json_build_object(
    'success', true,
    'counts', (
      select json_build_object(
        'total',       count(*),
        'open',        count(*) filter (where t.status = 'เปิด Ticket'),
        'inprogress',  count(*) filter (where t.status = 'กำลังดำเนินการ'),
        'approve',     count(*) filter (where t.status = 'ต้องการ Approve'),
        'resolved',    count(*) filter (where t.status = 'ดำเนินการเรียบร้อย'),
        'closed',      count(*) filter (where t.status = 'ปิดงานแล้ว'),
        'cancelled',   count(*) filter (where t.status = 'ยกเลิก')
      )
      from tickets t
      where (is_adm or t.employee_id = p_emp_id)
    ),
    'filtered_total', (
      select count(*) from tickets t
      where (is_adm or t.employee_id = p_emp_id)
        and (p_status is null or p_status = '' or p_status = 'all' or t.status = p_status)
        and (p_plant  is null or p_plant  = '' or t.plant = p_plant or t.location like p_plant || '%')
        and (p_admin  is null or p_admin  = '' or t.admin  = p_admin)
        and (d_from is null or t.created_at >= d_from)
        and (d_to   is null or t.created_at <  d_to)
        and (search_pat is null or
             lower(coalesce(t.ticket_no, '')) like search_pat or
             lower(coalesce(t.employee_name, '')) like search_pat or
             lower(coalesce(t.employee_id, '')) like search_pat or
             lower(coalesce(t.job_type, '')) like search_pat or
             lower(coalesce(t.issue_type, '')) like search_pat or
             lower(coalesce(t.symptom, '')) like search_pat or
             lower(coalesce(t.request, '')) like search_pat or
             lower(coalesce(t.detail, '')) like search_pat or
             lower(coalesce(t.admin, '')) like search_pat or
             lower(coalesce(t.location, '')) like search_pat or
             lower(coalesce(t.vnc_number, '')) like search_pat)
    ),
    'tickets', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json)
      from (
        select key, ticket_no, created_at, employee_id, employee_name,
               plant, job_type, issue_type, symptom, detail, request,
               vnc_number, phone, status, reply, admin, location,
               priority, due_at, resolved_at, photo_urls, file_urls,
               reply_photo_urls
        from tickets t
        where (is_adm or t.employee_id = p_emp_id)
          and (p_status is null or p_status = '' or p_status = 'all' or t.status = p_status)
          and (p_plant  is null or p_plant  = '' or t.plant = p_plant or t.location like p_plant || '%')
          and (p_admin  is null or p_admin  = '' or t.admin  = p_admin)
          and (d_from is null or t.created_at >= d_from)
          and (d_to   is null or t.created_at <  d_to)
          and (search_pat is null or
               lower(coalesce(t.ticket_no, '')) like search_pat or
               lower(coalesce(t.employee_name, '')) like search_pat or
               lower(coalesce(t.employee_id, '')) like search_pat or
               lower(coalesce(t.job_type, '')) like search_pat or
               lower(coalesce(t.issue_type, '')) like search_pat or
               lower(coalesce(t.symptom, '')) like search_pat or
               lower(coalesce(t.request, '')) like search_pat or
               lower(coalesce(t.detail, '')) like search_pat or
               lower(coalesce(t.admin, '')) like search_pat or
               lower(coalesce(t.location, '')) like search_pat or
               lower(coalesce(t.vnc_number, '')) like search_pat)
        order by
          case coalesce(priority, 'medium')
            when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 9
          end,
          created_at desc
        limit greatest(1, least(p_limit, 500))
        offset greatest(0, p_offset)
      ) x
    )
  ) into result;
  return result;
end;
$body$;

revoke all on function get_tickets_paginated(text, text, int, int, text, text, text, text, text, text) from public;
grant execute on function get_tickets_paginated(text, text, int, int, text, text, text, text, text, text) to anon, authenticated;

-- Drop old 2-param version (conflicts with new 4-param signature)
drop function if exists get_dashboard_stats(text, text);

-- Dashboard aggregation RPC (with year/month filter)
create or replace function get_dashboard_stats(
  p_emp_id   text,
  p_password text,
  p_year     int default null,
  p_month    int default null
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp employees%rowtype;
  f   text := '';  -- WHERE fragment for date filter
begin
  select * into emp from employees where employee_id = p_emp_id and password = p_password;
  if not found or not coalesce(emp.is_admin, false) then
    return json_build_object('success', false, 'message', 'Admin only');
  end if;

  -- Build date filter fragment
  if p_year is not null then
    f := f || ' and extract(year from created_at) = ' || p_year;
  end if;
  if p_month is not null then
    f := f || ' and extract(month from created_at) = ' || p_month;
  end if;

  return json_build_object(
    'success', true,
    'monthly', (
      select coalesce(json_agg(row_to_json(x) order by x.month), '[]'::json)
      from (
        select to_char(created_at, 'YYYY-MM') as month,
               count(*) as total,
               count(*) filter (where status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว')) as resolved,
               count(*) filter (where status = 'เปิด Ticket') as open
        from tickets
        where created_at >= now() - interval '24 months'
          and (p_year is null or extract(year from created_at) = p_year)
        group by to_char(created_at, 'YYYY-MM')
      ) x
    ),
    'byPlant', (
      select coalesce(json_agg(row_to_json(x) order by x.total desc), '[]'::json)
      from (
        select coalesce(plant, 'ไม่ระบุ') as plant, count(*) as total
        from tickets where true
          and (p_year is null or extract(year from created_at) = p_year)
          and (p_month is null or extract(month from created_at) = p_month)
        group by plant
      ) x
    ),
    'topIssues', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json)
      from (
        select coalesce(issue_type, 'ไม่ระบุ') as issue, count(*) as total
        from tickets where true
          and (p_year is null or extract(year from created_at) = p_year)
          and (p_month is null or extract(month from created_at) = p_month)
        group by issue_type order by count(*) desc limit 10
      ) x
    ),
    'topSymptoms', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json)
      from (
        select coalesce(symptom, 'ไม่ระบุ') as symptom, count(*) as total
        from tickets where true
          and (p_year is null or extract(year from created_at) = p_year)
          and (p_month is null or extract(month from created_at) = p_month)
        group by symptom order by count(*) desc limit 10
      ) x
    ),
    'byAdmin', (
      select coalesce(json_agg(row_to_json(x) order by x.total desc), '[]'::json)
      from (
        select coalesce(admin, 'ยังไม่มอบหมาย') as admin, count(*) as total,
               count(*) filter (where status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว')) as resolved
        from tickets where true
          and (p_year is null or extract(year from created_at) = p_year)
          and (p_month is null or extract(month from created_at) = p_month)
        group by admin
      ) x
    ),
    'byDept', (
      select coalesce(json_agg(row_to_json(x) order by x.total desc), '[]'::json)
      from (
        select coalesce(e.department, 'ไม่ระบุ') as dept,
               coalesce(e.section, '') as section,
               count(*) as total
        from tickets t
        left join employees e on e.employee_id = t.employee_id
        where true
          and (p_year is null or extract(year from t.created_at) = p_year)
          and (p_month is null or extract(month from t.created_at) = p_month)
        group by e.department, e.section
        order by count(*) desc limit 15
      ) x
    ),
    'byPriority', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json)
      from (
        select coalesce(priority, 'medium') as priority, count(*) as total
        from tickets where true
          and (p_year is null or extract(year from created_at) = p_year)
          and (p_month is null or extract(month from created_at) = p_month)
        group by priority
      ) x
    ),
    'adminPerf', (
      select coalesce(json_agg(row_to_json(x) order by x.pending desc, x.total desc), '[]'::json)
      from (
        select
          coalesce(t.admin, 'ยังไม่มอบหมาย') as admin,
          count(*) as total,
          count(*) filter (where t.status in ('เปิด Ticket','กำลังดำเนินการ')) as pending,
          count(*) filter (where t.status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว')) as resolved,
          count(*) filter (where t.status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว')
            and t.due_at is not null and (t.resolved_at is null or t.resolved_at <= t.due_at)) as on_time,
          round(avg(case when t.resolved_at is not null and t.status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว')
            then extract(epoch from (t.resolved_at - t.created_at)) / 3600.0
            else null end)::numeric, 1) as avg_hours,
          count(*) filter (where t.priority = 'urgent' and t.status in ('เปิด Ticket','กำลังดำเนินการ')) as urgent_pending,
          count(*) filter (where t.priority = 'high' and t.status in ('เปิด Ticket','กำลังดำเนินการ')) as high_pending
        from tickets t
        where t.admin is not null and t.admin <> ''
          and (p_year is null or extract(year from t.created_at) = p_year)
          and (p_month is null or extract(month from t.created_at) = p_month)
        group by t.admin
      ) x
    ),
    'slaPerf', (
      select json_build_object(
        'total',   count(*) filter (where status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว')),
        'onTime',  count(*) filter (where status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว') and (resolved_at is null or due_at is null or resolved_at <= due_at)),
        'overdue', count(*) filter (where status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว') and resolved_at is not null and due_at is not null and resolved_at > due_at)
      ) from tickets
      where true
        and (p_year is null or extract(year from created_at) = p_year)
        and (p_month is null or extract(month from created_at) = p_month)
    )
  );
end;
$body$;

revoke all on function get_dashboard_stats(text, text, int, int) from public;
grant execute on function get_dashboard_stats(text, text, int, int) to anon, authenticated;

-- Updated update_ticket to accept reply photos
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
  is_adm       boolean;
  emp          employees%rowtype;
  tid          bigint;
  old_row      tickets%rowtype;
  new_status   text;
  new_admin    text;
  new_reply    text;
  new_priority text;
  new_reply_photos text[];
  admin_label  text;
  notif_msg    text;
begin
  select * into emp from employees
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

  new_status   := coalesce(nullif(payload->>'status', ''), old_row.status);
  new_admin    := coalesce(payload->>'admin', old_row.admin);
  new_reply    := coalesce(payload->>'reply', old_row.reply);
  new_priority := coalesce(nullif(payload->>'priority', ''), old_row.priority);

  -- Parse reply photos (JSON array string → text[])
  begin
    select array_agg(x::text) into new_reply_photos
    from json_array_elements_text(coalesce(payload->'replyPhotos', old_row.reply_photo_urls::json)) x;
  exception when others then
    new_reply_photos := old_row.reply_photo_urls;
  end;

  admin_label := trim(coalesce(emp.first_name, '') || ' ' || coalesce(emp.last_name, ''));
  if admin_label = '' then admin_label := emp.employee_id; end if;

  -- History
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
  if coalesce(old_row.priority, '') <> coalesce(new_priority, '') then
    insert into ticket_history (ticket_key, ticket_no, changed_by_id, changed_by_name, field, old_value, new_value)
    values (tid, old_row.ticket_no, emp.employee_id, admin_label, 'priority', old_row.priority, new_priority);
  end if;

  update tickets set
    status           = new_status,
    admin            = new_admin,
    reply            = new_reply,
    priority         = new_priority,
    reply_photo_urls = new_reply_photos
  where key = tid;

  -- Notification
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
      values (old_row.employee_id, old_row.ticket_no,
              'Ticket ' || old_row.ticket_no || ' มีการอัพเดท', notif_msg);
    end if;
  end if;

  return json_build_object('success', true);
end;
$body$;

grant execute on function update_ticket(text, text, json) to anon, authenticated;
