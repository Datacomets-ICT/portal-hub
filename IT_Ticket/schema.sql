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
