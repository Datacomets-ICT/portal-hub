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
