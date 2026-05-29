-- ============================================================
-- Phase 34: ให้ 'system' role เห็นทุกอย่างเหมือน 'manager'
--   อัปเดตทุก RPC ที่มี role-based filtering
-- ============================================================

-- ========== get_tickets_paginated ==========
drop function if exists get_tickets_paginated(text, text, int, int, text, text, text, text, text, text, text, text, text, text);

create or replace function get_tickets_paginated(
  p_emp_id text, p_password text,
  p_limit int default 100, p_offset int default 0,
  p_status text default null, p_search text default null,
  p_plant text default null, p_admin text default null,
  p_date_from text default null, p_date_to text default null,
  p_issue_type text default null, p_symptom text default null,
  p_priority text default null, p_dept text default null
) returns json language plpgsql security definer set search_path = public as $body$
declare
  emp employees%rowtype;
  v_role text; v_scope text;
  v_my_names text[]; v_my_pref text;
  search_pat text; d_from timestamptz; d_to timestamptz; result json;
begin
  select * into emp from employees where employee_id = p_emp_id and password = p_password;
  if not found then return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์'); end if;

  v_role  := coalesce(emp.role, 'user');
  v_scope := emp.scope_company;

  if v_role = 'officer' then
    v_my_names := array_remove(array[
      emp.nickname, emp.first_name, emp.employee_id,
      coalesce(emp.first_name,'') || ' ' || coalesce(emp.last_name,''),
      coalesce(emp.first_name,'') || ' (' || coalesce(emp.nickname,'') || ')'
    ], null);
    v_my_pref := emp.employee_id || '_';
  end if;

  search_pat := case when p_search is null or p_search='' then null else '%' || lower(p_search) || '%' end;
  d_from := case when p_date_from is not null and p_date_from<>'' then p_date_from::timestamptz else null end;
  d_to   := case when p_date_to   is not null and p_date_to  <>'' then (p_date_to::date + 1)::timestamptz else null end;

  select json_build_object(
    'success', true, 'role', v_role, 'scope', v_scope,
    'counts', (
      select json_build_object(
        'total', count(*),
        'open', count(*) filter (where t.status = 'เปิด Ticket'),
        'inprogress', count(*) filter (where t.status = 'กำลังดำเนินการ'),
        'approve', count(*) filter (where t.status = 'ต้องการ Approve'),
        'resolved', count(*) filter (where t.status = 'ดำเนินการเรียบร้อย'),
        'closed', count(*) filter (where t.status = 'ปิดงานแล้ว'),
        'cancelled', count(*) filter (where t.status = 'ยกเลิก')
      )
      from tickets t
      left join employees reporter on reporter.employee_id = t.employee_id
      where case when v_role in ('manager','system') then true
                 when v_role = 'senior_manager' then (case v_scope when 'ICT' then reporter.company='ICT' when 'Comets' then reporter.company in ('Comets','JA') else false end)
                 when v_role = 'officer' then (t.admin = any(v_my_names) or t.admin like v_my_pref || '%')
                 else t.employee_id = p_emp_id end
    ),
    'filtered_total', (
      select count(*) from tickets t left join employees e on e.employee_id = t.employee_id
      where case when v_role in ('manager','system') then true
                 when v_role = 'senior_manager' then (case v_scope when 'ICT' then e.company='ICT' when 'Comets' then e.company in ('Comets','JA') else false end)
                 when v_role = 'officer' then (t.admin = any(v_my_names) or t.admin like v_my_pref || '%')
                 else t.employee_id = p_emp_id end
        and (p_status is null or p_status='' or p_status='all' or t.status = p_status)
        and (p_plant is null or p_plant='' or t.plant = p_plant or t.location like p_plant || '%')
        and (p_admin is null or p_admin='' or t.admin = p_admin)
        and (d_from is null or t.created_at >= d_from)
        and (d_to is null or t.created_at < d_to)
        and (p_issue_type is null or p_issue_type='' or coalesce(t.issue_type,'ไม่ระบุ') = p_issue_type)
        and (p_symptom is null or p_symptom='' or coalesce(t.symptom,'ไม่ระบุ') = p_symptom)
        and (p_priority is null or p_priority='' or coalesce(t.priority,'medium') = p_priority)
        and (p_dept is null or p_dept='' or coalesce(e.department,'ไม่ระบุ') = p_dept)
        and (search_pat is null or
             lower(coalesce(t.ticket_no,'')) like search_pat or lower(coalesce(t.employee_name,'')) like search_pat or
             lower(coalesce(t.employee_id,'')) like search_pat or lower(coalesce(t.job_type,'')) like search_pat or
             lower(coalesce(t.issue_type,'')) like search_pat or lower(coalesce(t.symptom,'')) like search_pat or
             lower(coalesce(t.request,'')) like search_pat or lower(coalesce(t.detail,'')) like search_pat or
             lower(coalesce(t.admin,'')) like search_pat or lower(coalesce(t.location,'')) like search_pat or
             lower(coalesce(t.vnc_number,'')) like search_pat)
    ),
    'tickets', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
        select t.key, t.ticket_no, t.created_at, t.employee_id, t.employee_name,
               t.plant, t.job_type, t.issue_type, t.symptom, t.detail, t.request,
               t.vnc_number, t.phone, t.status, t.reply, t.admin, t.location,
               t.priority, t.due_at, t.resolved_at, t.photo_urls, t.file_urls, t.reply_photo_urls
        from tickets t left join employees e on e.employee_id = t.employee_id
        where case when v_role in ('manager','system') then true
                   when v_role = 'senior_manager' then (case v_scope when 'ICT' then e.company='ICT' when 'Comets' then e.company in ('Comets','JA') else false end)
                   when v_role = 'officer' then (t.admin = any(v_my_names) or t.admin like v_my_pref || '%')
                   else t.employee_id = p_emp_id end
          and (p_status is null or p_status='' or p_status='all' or t.status = p_status)
          and (p_plant is null or p_plant='' or t.plant = p_plant or t.location like p_plant || '%')
          and (p_admin is null or p_admin='' or t.admin = p_admin)
          and (d_from is null or t.created_at >= d_from)
          and (d_to is null or t.created_at < d_to)
          and (p_issue_type is null or p_issue_type='' or coalesce(t.issue_type,'ไม่ระบุ') = p_issue_type)
          and (p_symptom is null or p_symptom='' or coalesce(t.symptom,'ไม่ระบุ') = p_symptom)
          and (p_priority is null or p_priority='' or coalesce(t.priority,'medium') = p_priority)
          and (p_dept is null or p_dept='' or coalesce(e.department,'ไม่ระบุ') = p_dept)
          and (search_pat is null or
               lower(coalesce(t.ticket_no,'')) like search_pat or lower(coalesce(t.employee_name,'')) like search_pat or
               lower(coalesce(t.employee_id,'')) like search_pat or lower(coalesce(t.job_type,'')) like search_pat or
               lower(coalesce(t.issue_type,'')) like search_pat or lower(coalesce(t.symptom,'')) like search_pat or
               lower(coalesce(t.request,'')) like search_pat or lower(coalesce(t.detail,'')) like search_pat or
               lower(coalesce(t.admin,'')) like search_pat or lower(coalesce(t.location,'')) like search_pat or
               lower(coalesce(t.vnc_number,'')) like search_pat)
        order by case coalesce(t.priority,'medium') when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 9 end,
                 t.created_at desc
        limit greatest(1, least(p_limit, 500)) offset greatest(0, p_offset)
      ) x
    )
  ) into result;
  return result;
end;
$body$;
grant execute on function get_tickets_paginated(text, text, int, int, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;

-- ========== get_unread_ticket_chats ==========
create or replace function get_unread_ticket_chats(p_emp_id text)
returns json language plpgsql security definer set search_path = public as $body$
declare
  emp employees%rowtype; v_role text; v_scope text;
  v_my_names text[]; v_my_pref text; result json;
begin
  select * into emp from employees where employee_id = p_emp_id;
  v_role := coalesce(emp.role, 'user'); v_scope := emp.scope_company;
  v_my_names := array_remove(array[
    emp.nickname, emp.first_name, emp.employee_id,
    coalesce(emp.first_name,'') || ' ' || coalesce(emp.last_name,''),
    coalesce(emp.first_name,'') || ' (' || coalesce(emp.nickname,'') || ')'
  ], null);
  v_my_pref := emp.employee_id || '_';

  select json_agg(row_to_json(x)) into result from (
    select tm.ticket_key as "ticketKey", tm.ticket_no as "ticketNo",
      count(*) filter (where tm.sender_id <> p_emp_id
                       and tm.created_at > coalesce(r.last_read_at, '1970-01-01'::timestamptz))::int as "unreadCount",
      max(tm.created_at) as "lastAt",
      (array_agg(case
        when tm.attachment_type = 'image' then '📷 ' || coalesce(nullif(tm.message,''), 'ส่งรูปภาพ')
        when tm.attachment_type = 'file' then '📎 ' || coalesce(tm.attachment_name, 'ไฟล์แนบ')
        else tm.message end order by tm.created_at desc))[1] as "lastMessage",
      (array_agg(tm.sender_name order by tm.created_at desc))[1] as "lastSender"
    from ticket_messages tm
    join tickets t on t.key = tm.ticket_key
    left join employees reporter on reporter.employee_id = t.employee_id
    left join ticket_message_reads r on r.ticket_key = tm.ticket_key and r.employee_id = p_emp_id
    where case v_role
            when 'user' then t.employee_id = p_emp_id
            when 'manager' then (coalesce(t.admin,'')='' or t.admin = any(v_my_names) or t.admin like v_my_pref || '%')
            when 'system'  then (coalesce(t.admin,'')='' or t.admin = any(v_my_names) or t.admin like v_my_pref || '%')
            when 'senior_manager' then (
              (case v_scope when 'ICT' then reporter.company='ICT' when 'Comets' then reporter.company in ('Comets','JA') else false end)
              and (coalesce(t.admin,'')='' or t.admin = any(v_my_names) or t.admin like v_my_pref || '%')
            )
            when 'officer' then (t.admin = any(v_my_names) or t.admin like v_my_pref || '%')
            else t.employee_id = p_emp_id end
    group by tm.ticket_key, tm.ticket_no, r.last_read_at
    order by max(tm.created_at) desc limit 50
  ) x;
  return coalesce(result, '[]'::json);
end; $body$;
grant execute on function get_unread_ticket_chats(text) to anon, authenticated;

-- ========== send_ticket_message: system = manager ==========
create or replace function send_ticket_message(
  p_emp_id text, p_password text, p_ticket_key bigint, p_message text,
  p_attachment_url text default null, p_attachment_name text default null, p_attachment_type text default null
) returns json language plpgsql security definer set search_path = public as $body$
declare
  emp employees%rowtype; t tickets%rowtype; reporter employees%rowtype;
  sender_display text; v_role text; v_scope text;
  can_access boolean := false; admin_matches_me boolean;
begin
  select * into emp from employees where employee_id = p_emp_id and password = p_password;
  if not found then return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์'); end if;
  select * into t from tickets where key = p_ticket_key;
  if not found then return json_build_object('success', false, 'message', 'ไม่พบ ticket'); end if;

  v_role := coalesce(emp.role, 'user'); v_scope := emp.scope_company;

  admin_matches_me := (t.admin is not null and t.admin <> '' and (
    t.admin like emp.employee_id || '\_%' escape '\' or t.admin = emp.employee_id
    or t.admin = emp.nickname or t.admin = emp.first_name
    or t.admin = coalesce(emp.first_name,'') || ' ' || coalesce(emp.last_name,'')
    or t.admin = coalesce(emp.first_name,'') || ' (' || coalesce(emp.nickname,'') || ')'
  ));

  if emp.employee_id = t.employee_id then can_access := true;
  elsif v_role in ('manager','system') then can_access := true;
  elsif v_role = 'senior_manager' then
    select * into reporter from employees where employee_id = t.employee_id;
    if v_scope = 'ICT' and reporter.company = 'ICT' then can_access := true; end if;
    if v_scope = 'Comets' and reporter.company in ('Comets','JA') then can_access := true; end if;
  elsif v_role = 'officer' then
    if admin_matches_me then can_access := true; end if;
  end if;

  if not can_access then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์ส่งข้อความใน Ticket นี้');
  end if;

  sender_display := trim(coalesce(emp.nickname,'') || ' ' || coalesce(emp.first_name,''));
  if sender_display = '' then sender_display := emp.employee_id; end if;

  insert into ticket_messages(ticket_key, ticket_no, sender_id, sender_name, is_admin, message,
    attachment_url, attachment_name, attachment_type)
  values (p_ticket_key, t.ticket_no, emp.employee_id, sender_display,
    v_role <> 'user', coalesce(p_message,''), p_attachment_url, p_attachment_name, p_attachment_type);

  insert into ticket_message_reads(employee_id, ticket_key, last_read_at)
  values (p_emp_id, p_ticket_key, now())
  on conflict (employee_id, ticket_key) do update set last_read_at = now();

  return json_build_object('success', true);
end; $body$;
grant execute on function send_ticket_message(text, text, bigint, text, text, text, text) to anon, authenticated;

-- ========== get_dashboard_stats: system = manager ==========
drop function if exists get_dashboard_stats(text, text, int, int, text);

create or replace function get_dashboard_stats(
  p_emp_id text, p_password text,
  p_year int default null, p_month int default null, p_admin text default null
) returns json language plpgsql security definer set search_path = public as $body$
declare
  emp employees%rowtype; v_role text; v_scope text; v_my_names text[];
begin
  select * into emp from employees where employee_id = p_emp_id and password = p_password;
  if not found then return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์'); end if;

  v_role  := coalesce(emp.role, 'user'); v_scope := emp.scope_company;

  if v_role not in ('manager','senior_manager','officer','system') then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์เข้า Dashboard');
  end if;

  if v_role = 'officer' then
    v_my_names := array_remove(array[
      emp.nickname, emp.first_name, emp.employee_id,
      coalesce(emp.first_name,'') || ' ' || coalesce(emp.last_name,''),
      coalesce(emp.first_name,'') || ' (' || coalesce(emp.nickname,'') || ')'
    ], null);
  end if;

  return json_build_object(
    'success', true, 'role', v_role, 'scope', v_scope,
    'monthly', (
      select coalesce(json_agg(row_to_json(x) order by x.month), '[]'::json) from (
        select to_char(t.created_at, 'YYYY-MM') as month, count(*) as total,
          count(*) filter (where t.status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว')) as resolved,
          count(*) filter (where t.status = 'เปิด Ticket') as open
        from tickets t left join employees e on e.employee_id = t.employee_id
        where t.created_at >= now() - interval '24 months'
          and case when v_role in ('manager','system') then true
                   when v_role = 'senior_manager' then (case v_scope when 'ICT' then e.company='ICT' when 'Comets' then e.company in ('Comets','JA') else false end)
                   when v_role = 'officer' then (t.admin = any(v_my_names) or t.admin like emp.employee_id || '\_%' escape '\')
                   else false end
          and (p_year is null or extract(year from t.created_at) = p_year)
          and (p_admin is null or p_admin='' or t.admin = p_admin)
        group by to_char(t.created_at, 'YYYY-MM')
      ) x
    ),
    'byPlant', (
      select coalesce(json_agg(row_to_json(x) order by x.total desc), '[]'::json) from (
        select coalesce(t.plant,'ไม่ระบุ') as plant, count(*) as total
        from tickets t left join employees e on e.employee_id = t.employee_id
        where case when v_role in ('manager','system') then true
                   when v_role = 'senior_manager' then (case v_scope when 'ICT' then e.company='ICT' when 'Comets' then e.company in ('Comets','JA') else false end)
                   when v_role = 'officer' then (t.admin = any(v_my_names) or t.admin like emp.employee_id || '\_%' escape '\')
                   else false end
          and (p_year is null or extract(year from t.created_at) = p_year)
          and (p_month is null or extract(month from t.created_at) = p_month)
          and (p_admin is null or p_admin='' or t.admin = p_admin)
        group by t.plant
      ) x
    ),
    'topIssues', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
        select coalesce(t.issue_type,'ไม่ระบุ') as issue, count(*) as total
        from tickets t left join employees e on e.employee_id = t.employee_id
        where case when v_role in ('manager','system') then true
                   when v_role = 'senior_manager' then (case v_scope when 'ICT' then e.company='ICT' when 'Comets' then e.company in ('Comets','JA') else false end)
                   when v_role = 'officer' then (t.admin = any(v_my_names) or t.admin like emp.employee_id || '\_%' escape '\')
                   else false end
          and (p_year is null or extract(year from t.created_at) = p_year)
          and (p_month is null or extract(month from t.created_at) = p_month)
          and (p_admin is null or p_admin='' or t.admin = p_admin)
        group by t.issue_type order by count(*) desc limit 10
      ) x
    ),
    'topSymptoms', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
        select coalesce(t.symptom,'ไม่ระบุ') as symptom, count(*) as total
        from tickets t left join employees e on e.employee_id = t.employee_id
        where case when v_role in ('manager','system') then true
                   when v_role = 'senior_manager' then (case v_scope when 'ICT' then e.company='ICT' when 'Comets' then e.company in ('Comets','JA') else false end)
                   when v_role = 'officer' then (t.admin = any(v_my_names) or t.admin like emp.employee_id || '\_%' escape '\')
                   else false end
          and (p_year is null or extract(year from t.created_at) = p_year)
          and (p_month is null or extract(month from t.created_at) = p_month)
          and (p_admin is null or p_admin='' or t.admin = p_admin)
        group by t.symptom order by count(*) desc limit 10
      ) x
    ),
    'byAdmin', (
      select coalesce(json_agg(row_to_json(x) order by x.total desc), '[]'::json) from (
        select coalesce(adm.nickname, adm.first_name, coalesce(t.admin,'ยังไม่มอบหมาย')) as admin,
          count(*) as total, count(*) filter (where t.status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว')) as resolved
        from tickets t left join employees e on e.employee_id = t.employee_id
        left join employees adm on (coalesce(t.admin,'') <> '' and (
          t.admin like adm.employee_id || '\_%' escape '\' or t.admin = adm.employee_id
          or t.admin = adm.nickname or t.admin = adm.first_name
          or t.admin = coalesce(adm.first_name,'') || ' ' || coalesce(adm.last_name,'')
          or t.admin = coalesce(adm.first_name,'') || ' (' || coalesce(adm.nickname,'') || ')'))
        where case when v_role in ('manager','system') then true
                   when v_role = 'senior_manager' then (case v_scope when 'ICT' then e.company='ICT' when 'Comets' then e.company in ('Comets','JA') else false end)
                   when v_role = 'officer' then (t.admin = any(v_my_names) or t.admin like emp.employee_id || '\_%' escape '\')
                   else false end
          and case v_role when 'senior_manager' then (coalesce(t.admin,'')='' or adm.scope_company = v_scope or adm.role in ('manager','system')) else true end
          and (p_year is null or extract(year from t.created_at) = p_year)
          and (p_month is null or extract(month from t.created_at) = p_month)
          and (p_admin is null or p_admin='' or t.admin = p_admin)
        group by coalesce(adm.employee_id, t.admin), coalesce(adm.nickname, adm.first_name, coalesce(t.admin,'ยังไม่มอบหมาย'))
      ) x
    ),
    'byDept', (
      select coalesce(json_agg(row_to_json(x) order by x.total desc), '[]'::json) from (
        select coalesce(e.department,'ไม่ระบุ') as dept, coalesce(e.section,'') as section, count(*) as total
        from tickets t left join employees e on e.employee_id = t.employee_id
        where case when v_role in ('manager','system') then true
                   when v_role = 'senior_manager' then (case v_scope when 'ICT' then e.company='ICT' when 'Comets' then e.company in ('Comets','JA') else false end)
                   when v_role = 'officer' then (t.admin = any(v_my_names) or t.admin like emp.employee_id || '\_%' escape '\')
                   else false end
          and (p_year is null or extract(year from t.created_at) = p_year)
          and (p_month is null or extract(month from t.created_at) = p_month)
          and (p_admin is null or p_admin='' or t.admin = p_admin)
        group by e.department, e.section order by count(*) desc limit 15
      ) x
    ),
    'byPriority', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
        select coalesce(t.priority,'medium') as priority, count(*) as total
        from tickets t left join employees e on e.employee_id = t.employee_id
        where case when v_role in ('manager','system') then true
                   when v_role = 'senior_manager' then (case v_scope when 'ICT' then e.company='ICT' when 'Comets' then e.company in ('Comets','JA') else false end)
                   when v_role = 'officer' then (t.admin = any(v_my_names) or t.admin like emp.employee_id || '\_%' escape '\')
                   else false end
          and (p_year is null or extract(year from t.created_at) = p_year)
          and (p_month is null or extract(month from t.created_at) = p_month)
          and (p_admin is null or p_admin='' or t.admin = p_admin)
        group by t.priority
      ) x
    ),
    'adminPerf', (
      select coalesce(json_agg(row_to_json(x) order by x.pending desc, x.total desc), '[]'::json) from (
        select coalesce(adm.nickname, adm.first_name, t.admin) as admin, count(*) as total,
          count(*) filter (where t.status in ('เปิด Ticket','กำลังดำเนินการ')) as pending,
          count(*) filter (where t.status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว')) as resolved,
          count(*) filter (where t.status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว')
            and t.due_at is not null and (t.resolved_at is null or t.resolved_at <= t.due_at)) as on_time,
          round(avg(case when t.resolved_at is not null and t.status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว')
            then extract(epoch from (t.resolved_at - t.created_at))/3600.0 else null end)::numeric, 1) as avg_hours,
          count(*) filter (where t.priority = 'urgent' and t.status in ('เปิด Ticket','กำลังดำเนินการ')) as urgent_pending,
          count(*) filter (where t.priority = 'high' and t.status in ('เปิด Ticket','กำลังดำเนินการ')) as high_pending
        from tickets t left join employees e on e.employee_id = t.employee_id
        left join employees adm on (coalesce(t.admin,'') <> '' and (
          t.admin like adm.employee_id || '\_%' escape '\' or t.admin = adm.employee_id
          or t.admin = adm.nickname or t.admin = adm.first_name
          or t.admin = coalesce(adm.first_name,'') || ' ' || coalesce(adm.last_name,'')
          or t.admin = coalesce(adm.first_name,'') || ' (' || coalesce(adm.nickname,'') || ')'))
        where t.admin is not null and t.admin <> ''
          and case when v_role in ('manager','system') then true
                   when v_role = 'senior_manager' then (case v_scope when 'ICT' then e.company='ICT' when 'Comets' then e.company in ('Comets','JA') else false end)
                   when v_role = 'officer' then (t.admin = any(v_my_names) or t.admin like emp.employee_id || '\_%' escape '\')
                   else false end
          and case v_role when 'senior_manager' then (adm.scope_company = v_scope or adm.role in ('manager','system')) else true end
          and (p_year is null or extract(year from t.created_at) = p_year)
          and (p_month is null or extract(month from t.created_at) = p_month)
          and (p_admin is null or p_admin='' or t.admin = p_admin)
        group by coalesce(adm.employee_id, t.admin), coalesce(adm.nickname, adm.first_name, t.admin)
      ) x
    ),
    'slaPerf', (
      select json_build_object(
        'total', count(*) filter (where t.status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว')),
        'onTime', count(*) filter (where t.status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว') and (t.resolved_at is null or t.due_at is null or t.resolved_at <= t.due_at)),
        'overdue', count(*) filter (where t.status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว') and t.resolved_at is not null and t.due_at is not null and t.resolved_at > t.due_at)
      ) from tickets t left join employees e on e.employee_id = t.employee_id
      where case when v_role in ('manager','system') then true
                 when v_role = 'senior_manager' then (case v_scope when 'ICT' then e.company='ICT' when 'Comets' then e.company in ('Comets','JA') else false end)
                 when v_role = 'officer' then (t.admin = any(v_my_names) or t.admin like emp.employee_id || '\_%' escape '\')
                 else false end
        and (p_year is null or extract(year from t.created_at) = p_year)
        and (p_month is null or extract(month from t.created_at) = p_month)
        and (p_admin is null or p_admin='' or t.admin = p_admin)
    )
  );
end; $body$;
grant execute on function get_dashboard_stats(text, text, int, int, text) to anon, authenticated;
