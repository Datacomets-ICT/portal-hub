-- ============================================================
-- Phase 22: Dashboard admin filter + chart drill-down params
-- ============================================================

-- Drop old signatures
drop function if exists get_dashboard_stats(text, text, int, int);
drop function if exists get_tickets_paginated(text, text, int, int, text, text, text, text, text, text);

-- ============================================================
-- Dashboard stats with admin filter + p_dept support
-- ============================================================
create or replace function get_dashboard_stats(
  p_emp_id   text,
  p_password text,
  p_year     int default null,
  p_month    int default null,
  p_admin    text default null
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
    'monthly', (
      select coalesce(json_agg(row_to_json(x) order by x.month), '[]'::json)
      from (
        select to_char(created_at, 'YYYY-MM') as month,
               count(*) as total,
               count(*) filter (where status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว')) as resolved,
               count(*) filter (where status = 'เปิด Ticket') as open
        from tickets
        where created_at >= now() - interval '24 months'
          and (p_year  is null or extract(year  from created_at) = p_year)
          and (p_admin is null or p_admin = '' or admin = p_admin)
        group by to_char(created_at, 'YYYY-MM')
      ) x
    ),
    'byPlant', (
      select coalesce(json_agg(row_to_json(x) order by x.total desc), '[]'::json)
      from (
        select coalesce(plant, 'ไม่ระบุ') as plant, count(*) as total
        from tickets where true
          and (p_year  is null or extract(year  from created_at) = p_year)
          and (p_month is null or extract(month from created_at) = p_month)
          and (p_admin is null or p_admin = '' or admin = p_admin)
        group by plant
      ) x
    ),
    'topIssues', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json)
      from (
        select coalesce(issue_type, 'ไม่ระบุ') as issue, count(*) as total
        from tickets where true
          and (p_year  is null or extract(year  from created_at) = p_year)
          and (p_month is null or extract(month from created_at) = p_month)
          and (p_admin is null or p_admin = '' or admin = p_admin)
        group by issue_type order by count(*) desc limit 10
      ) x
    ),
    'topSymptoms', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json)
      from (
        select coalesce(symptom, 'ไม่ระบุ') as symptom, count(*) as total
        from tickets where true
          and (p_year  is null or extract(year  from created_at) = p_year)
          and (p_month is null or extract(month from created_at) = p_month)
          and (p_admin is null or p_admin = '' or admin = p_admin)
        group by symptom order by count(*) desc limit 10
      ) x
    ),
    'byAdmin', (
      select coalesce(json_agg(row_to_json(x) order by x.total desc), '[]'::json)
      from (
        select coalesce(admin, 'ยังไม่มอบหมาย') as admin, count(*) as total,
               count(*) filter (where status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว')) as resolved
        from tickets where true
          and (p_year  is null or extract(year  from created_at) = p_year)
          and (p_month is null or extract(month from created_at) = p_month)
          and (p_admin is null or p_admin = '' or admin = p_admin)
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
          and (p_year  is null or extract(year  from t.created_at) = p_year)
          and (p_month is null or extract(month from t.created_at) = p_month)
          and (p_admin is null or p_admin = '' or t.admin = p_admin)
        group by e.department, e.section
        order by count(*) desc limit 15
      ) x
    ),
    'byPriority', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json)
      from (
        select coalesce(priority, 'medium') as priority, count(*) as total
        from tickets where true
          and (p_year  is null or extract(year  from created_at) = p_year)
          and (p_month is null or extract(month from created_at) = p_month)
          and (p_admin is null or p_admin = '' or admin = p_admin)
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
          count(*) filter (where t.priority = 'high'   and t.status in ('เปิด Ticket','กำลังดำเนินการ')) as high_pending
        from tickets t
        where t.admin is not null and t.admin <> ''
          and (p_year  is null or extract(year  from t.created_at) = p_year)
          and (p_month is null or extract(month from t.created_at) = p_month)
          and (p_admin is null or p_admin = '' or t.admin = p_admin)
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
        and (p_year  is null or extract(year  from created_at) = p_year)
        and (p_month is null or extract(month from created_at) = p_month)
        and (p_admin is null or p_admin = '' or admin = p_admin)
    )
  );
end;
$body$;

grant execute on function get_dashboard_stats(text, text, int, int, text) to anon, authenticated;

-- ============================================================
-- Ticket list paginated with drill-down filters (issue_type, symptom, priority, dept)
-- ============================================================
create or replace function get_tickets_paginated(
  p_emp_id      text,
  p_password    text,
  p_limit       int default 100,
  p_offset      int default 0,
  p_status      text default null,
  p_search      text default null,
  p_plant       text default null,
  p_admin       text default null,
  p_date_from   text default null,
  p_date_to     text default null,
  p_issue_type  text default null,
  p_symptom     text default null,
  p_priority    text default null,
  p_dept        text default null
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
      left join employees e on e.employee_id = t.employee_id
      where (is_adm or t.employee_id = p_emp_id)
        and (p_status is null or p_status = '' or p_status = 'all' or t.status = p_status)
        and (p_plant  is null or p_plant  = '' or t.plant = p_plant or t.location like p_plant || '%')
        and (p_admin  is null or p_admin  = '' or t.admin  = p_admin)
        and (d_from is null or t.created_at >= d_from)
        and (d_to   is null or t.created_at <  d_to)
        and (p_issue_type is null or p_issue_type = '' or coalesce(t.issue_type,'ไม่ระบุ') = p_issue_type)
        and (p_symptom    is null or p_symptom    = '' or coalesce(t.symptom,'ไม่ระบุ')    = p_symptom)
        and (p_priority   is null or p_priority   = '' or coalesce(t.priority,'medium')    = p_priority)
        and (p_dept       is null or p_dept       = '' or coalesce(e.department,'ไม่ระบุ') = p_dept)
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
        select t.key, t.ticket_no, t.created_at, t.employee_id, t.employee_name,
               t.plant, t.job_type, t.issue_type, t.symptom, t.detail, t.request,
               t.vnc_number, t.phone, t.status, t.reply, t.admin, t.location,
               t.priority, t.due_at, t.resolved_at, t.photo_urls, t.file_urls,
               t.reply_photo_urls
        from tickets t
        left join employees e on e.employee_id = t.employee_id
        where (is_adm or t.employee_id = p_emp_id)
          and (p_status is null or p_status = '' or p_status = 'all' or t.status = p_status)
          and (p_plant  is null or p_plant  = '' or t.plant = p_plant or t.location like p_plant || '%')
          and (p_admin  is null or p_admin  = '' or t.admin  = p_admin)
          and (d_from is null or t.created_at >= d_from)
          and (d_to   is null or t.created_at <  d_to)
          and (p_issue_type is null or p_issue_type = '' or coalesce(t.issue_type,'ไม่ระบุ') = p_issue_type)
          and (p_symptom    is null or p_symptom    = '' or coalesce(t.symptom,'ไม่ระบุ')    = p_symptom)
          and (p_priority   is null or p_priority   = '' or coalesce(t.priority,'medium')    = p_priority)
          and (p_dept       is null or p_dept       = '' or coalesce(e.department,'ไม่ระบุ') = p_dept)
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
          case coalesce(t.priority, 'medium')
            when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 9
          end,
          t.created_at desc
        limit greatest(1, least(p_limit, 500))
        offset greatest(0, p_offset)
      ) x
    )
  ) into result;
  return result;
end;
$body$;

grant execute on function get_tickets_paginated(text, text, int, int, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;
