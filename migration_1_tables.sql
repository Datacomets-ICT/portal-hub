-- ============================================================
-- Migration Part 1/3: Tables + RLS + Base RPCs
-- ============================================================
-- Run order: 1 → 2 → 3
-- After Part 3 complete:
--   1) Enable pg_cron extension (Database > Extensions)
--   2) Add ticket_messages to supabase_realtime publication
--   3) Create Storage bucket "ticket-attachments" (Public)
-- ============================================================


-- === schema.sql ===
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
      'phone',      coalesce(emp.phone, '')
    )
  );
end;
$body$;

revoke all on function login(text, text) from public;
grant execute on function login(text, text) to anon, authenticated;

-- ===== RPC: create_ticket =====
-- Generates ticket_no atomically as IT + YYMM + 4-digit sequence

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
begin
  prefix := 'IT' || to_char(now(), 'YYMM');

  select coalesce(
           max(substring(ticket_no from length(prefix) + 1)::int),
           0)
  into max_seq
  from tickets
  where ticket_no like prefix || '%'
    and substring(ticket_no from length(prefix) + 1) similar to '[0-9]+';

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
$body$;

revoke all on function create_ticket(json) from public;
grant execute on function create_ticket(json) to anon, authenticated;

-- === schema_v2.sql ===
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

-- === schema_v3.sql ===
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

-- === schema_v4.sql ===
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
