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
        and (p_plant  is null or p_plant  = '' or t.plant  = p_plant)
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
          and (p_plant  is null or p_plant  = '' or t.plant  = p_plant)
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

-- Dashboard aggregation RPC
create or replace function get_dashboard_stats(
  p_emp_id   text,
  p_password text
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp employees%rowtype;
begin
  select * into emp from employees where employee_id = p_emp_id and password = p_password;
  if not found or not coalesce(emp.is_admin, false) then
    return json_build_object('success', false, 'message', 'Admin only');
  end if;

  return json_build_object(
    'success', true,
    -- Tickets per month (last 12 months)
    'monthly', (
      select coalesce(json_agg(row_to_json(x) order by x.month), '[]'::json)
      from (
        select to_char(created_at, 'YYYY-MM') as month,
               count(*) as total,
               count(*) filter (where status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว')) as resolved,
               count(*) filter (where status = 'เปิด Ticket') as open
        from tickets
        where created_at >= now() - interval '12 months'
        group by to_char(created_at, 'YYYY-MM')
      ) x
    ),
    -- By company/plant
    'byPlant', (
      select coalesce(json_agg(row_to_json(x) order by x.total desc), '[]'::json)
      from (
        select coalesce(plant, 'ไม่ระบุ') as plant, count(*) as total
        from tickets group by plant
      ) x
    ),
    -- Top 10 issue types
    'topIssues', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json)
      from (
        select coalesce(issue_type, 'ไม่ระบุ') as issue, count(*) as total
        from tickets group by issue_type order by count(*) desc limit 10
      ) x
    ),
    -- Top 10 symptoms
    'topSymptoms', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json)
      from (
        select coalesce(symptom, 'ไม่ระบุ') as symptom, count(*) as total
        from tickets group by symptom order by count(*) desc limit 10
      ) x
    ),
    -- By admin (who handles most)
    'byAdmin', (
      select coalesce(json_agg(row_to_json(x) order by x.total desc), '[]'::json)
      from (
        select coalesce(admin, 'ยังไม่มอบหมาย') as admin, count(*) as total,
               count(*) filter (where status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว')) as resolved
        from tickets group by admin
      ) x
    ),
    -- By department
    'byDept', (
      select coalesce(json_agg(row_to_json(x) order by x.total desc), '[]'::json)
      from (
        select coalesce(e.department, 'ไม่ระบุ') as dept,
               coalesce(e.section, '') as section,
               count(*) as total
        from tickets t
        left join employees e on e.employee_id = t.employee_id
        group by e.department, e.section
        order by count(*) desc limit 15
      ) x
    ),
    -- Priority distribution
    'byPriority', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json)
      from (
        select coalesce(priority, 'medium') as priority, count(*) as total
        from tickets group by priority
      ) x
    ),
    -- SLA performance
    'slaPerf', (
      select json_build_object(
        'total',   count(*) filter (where status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว')),
        'onTime',  count(*) filter (where status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว') and (resolved_at is null or due_at is null or resolved_at <= due_at)),
        'overdue', count(*) filter (where status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว') and resolved_at is not null and due_at is not null and resolved_at > due_at)
      ) from tickets
    )
  );
end;
$body$;

revoke all on function get_dashboard_stats(text, text) from public;
grant execute on function get_dashboard_stats(text, text) to anon, authenticated;

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
