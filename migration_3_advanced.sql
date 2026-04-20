-- ============================================================
-- Migration Part 3/3: Priority, SLA, Dashboard, Realtime
-- ============================================================


-- === schema_v16.sql ===
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

-- === schema_v17.sql ===
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

-- === schema_v18.sql ===
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

-- === schema_v19.sql ===
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

-- === schema_v20.sql ===
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

-- === schema_v21.sql ===
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
