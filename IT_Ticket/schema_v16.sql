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
