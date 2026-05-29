-- ============================================================
-- Phase 32: Dashboard byAdmin + adminPerf — merge admins by employee
--   "ปุ๊ก" กับ "11329_ปุ๊ก" = คนเดียวกัน → นับรวมกัน แสดงชื่อเดียว
-- ============================================================

drop function if exists get_dashboard_stats(text, text, int, int, text);

create or replace function get_dashboard_stats(
  p_emp_id   text,
  p_password text,
  p_year     int  default null,
  p_month    int  default null,
  p_admin    text default null
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp        employees%rowtype;
  v_role     text;
  v_scope    text;
  v_my_names text[];
begin
  select * into emp from employees
   where employee_id = p_emp_id and password = p_password;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์');
  end if;

  v_role  := coalesce(emp.role, 'user');
  v_scope := emp.scope_company;

  if v_role not in ('manager','senior_manager','officer') then
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
    'success', true,
    'role',  v_role,
    'scope', v_scope,
    'monthly', (
      select coalesce(json_agg(row_to_json(x) order by x.month), '[]'::json)
      from (
        select to_char(t.created_at, 'YYYY-MM') as month,
               count(*) as total,
               count(*) filter (where t.status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว')) as resolved,
               count(*) filter (where t.status = 'เปิด Ticket') as open
        from tickets t
        left join employees e on e.employee_id = t.employee_id
        where t.created_at >= now() - interval '24 months'
          and case v_role
                when 'manager' then true
                when 'senior_manager' then (case v_scope when 'ICT' then e.company='ICT' when 'Comets' then e.company in ('Comets','JA') else false end)
                when 'officer' then (t.admin = any(v_my_names) or t.admin like emp.employee_id || '\_%' escape '\')
                else false end
          and (p_year is null or extract(year from t.created_at) = p_year)
          and (p_admin is null or p_admin='' or t.admin = p_admin)
        group by to_char(t.created_at, 'YYYY-MM')
      ) x
    ),
    'byPlant', (
      select coalesce(json_agg(row_to_json(x) order by x.total desc), '[]'::json)
      from (
        select coalesce(t.plant,'ไม่ระบุ') as plant, count(*) as total
        from tickets t
        left join employees e on e.employee_id = t.employee_id
        where case v_role
                when 'manager' then true
                when 'senior_manager' then (case v_scope when 'ICT' then e.company='ICT' when 'Comets' then e.company in ('Comets','JA') else false end)
                when 'officer' then (t.admin = any(v_my_names) or t.admin like emp.employee_id || '\_%' escape '\')
                else false end
          and (p_year is null or extract(year from t.created_at) = p_year)
          and (p_month is null or extract(month from t.created_at) = p_month)
          and (p_admin is null or p_admin='' or t.admin = p_admin)
        group by t.plant
      ) x
    ),
    'topIssues', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json)
      from (
        select coalesce(t.issue_type,'ไม่ระบุ') as issue, count(*) as total
        from tickets t
        left join employees e on e.employee_id = t.employee_id
        where case v_role
                when 'manager' then true
                when 'senior_manager' then (case v_scope when 'ICT' then e.company='ICT' when 'Comets' then e.company in ('Comets','JA') else false end)
                when 'officer' then (t.admin = any(v_my_names) or t.admin like emp.employee_id || '\_%' escape '\')
                else false end
          and (p_year is null or extract(year from t.created_at) = p_year)
          and (p_month is null or extract(month from t.created_at) = p_month)
          and (p_admin is null or p_admin='' or t.admin = p_admin)
        group by t.issue_type order by count(*) desc limit 10
      ) x
    ),
    'topSymptoms', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json)
      from (
        select coalesce(t.symptom,'ไม่ระบุ') as symptom, count(*) as total
        from tickets t
        left join employees e on e.employee_id = t.employee_id
        where case v_role
                when 'manager' then true
                when 'senior_manager' then (case v_scope when 'ICT' then e.company='ICT' when 'Comets' then e.company in ('Comets','JA') else false end)
                when 'officer' then (t.admin = any(v_my_names) or t.admin like emp.employee_id || '\_%' escape '\')
                else false end
          and (p_year is null or extract(year from t.created_at) = p_year)
          and (p_month is null or extract(month from t.created_at) = p_month)
          and (p_admin is null or p_admin='' or t.admin = p_admin)
        group by t.symptom order by count(*) desc limit 10
      ) x
    ),
    -- 🔥 byAdmin: group by resolved employee (merge duplicate names)
    'byAdmin', (
      select coalesce(json_agg(row_to_json(x) order by x.total desc), '[]'::json)
      from (
        select
          coalesce(adm.nickname, adm.first_name, coalesce(t.admin, 'ยังไม่มอบหมาย')) as admin,
          count(*) as total,
          count(*) filter (where t.status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว')) as resolved
        from tickets t
        left join employees e on e.employee_id = t.employee_id
        left join employees adm on (
              coalesce(t.admin,'') <> ''
          and (
                t.admin like adm.employee_id || '\_%' escape '\'
             or t.admin = adm.employee_id
             or t.admin = adm.nickname
             or t.admin = adm.first_name
             or t.admin = coalesce(adm.first_name,'') || ' ' || coalesce(adm.last_name,'')
             or t.admin = coalesce(adm.first_name,'') || ' (' || coalesce(adm.nickname,'') || ')'
          )
        )
        where case v_role
                when 'manager' then true
                when 'senior_manager' then (case v_scope when 'ICT' then e.company='ICT' when 'Comets' then e.company in ('Comets','JA') else false end)
                when 'officer' then (t.admin = any(v_my_names) or t.admin like emp.employee_id || '\_%' escape '\')
                else false end
          and case v_role
                when 'senior_manager' then (coalesce(t.admin,'') = '' or adm.scope_company = v_scope or adm.role = 'manager')
                else true end
          and (p_year is null or extract(year from t.created_at) = p_year)
          and (p_month is null or extract(month from t.created_at) = p_month)
          and (p_admin is null or p_admin='' or t.admin = p_admin)
        group by coalesce(adm.employee_id, t.admin), coalesce(adm.nickname, adm.first_name, coalesce(t.admin, 'ยังไม่มอบหมาย'))
      ) x
    ),
    'byDept', (
      select coalesce(json_agg(row_to_json(x) order by x.total desc), '[]'::json)
      from (
        select coalesce(e.department,'ไม่ระบุ') as dept,
               coalesce(e.section,'') as section,
               count(*) as total
        from tickets t
        left join employees e on e.employee_id = t.employee_id
        where case v_role
                when 'manager' then true
                when 'senior_manager' then (case v_scope when 'ICT' then e.company='ICT' when 'Comets' then e.company in ('Comets','JA') else false end)
                when 'officer' then (t.admin = any(v_my_names) or t.admin like emp.employee_id || '\_%' escape '\')
                else false end
          and (p_year is null or extract(year from t.created_at) = p_year)
          and (p_month is null or extract(month from t.created_at) = p_month)
          and (p_admin is null or p_admin='' or t.admin = p_admin)
        group by e.department, e.section
        order by count(*) desc limit 15
      ) x
    ),
    'byPriority', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json)
      from (
        select coalesce(t.priority,'medium') as priority, count(*) as total
        from tickets t
        left join employees e on e.employee_id = t.employee_id
        where case v_role
                when 'manager' then true
                when 'senior_manager' then (case v_scope when 'ICT' then e.company='ICT' when 'Comets' then e.company in ('Comets','JA') else false end)
                when 'officer' then (t.admin = any(v_my_names) or t.admin like emp.employee_id || '\_%' escape '\')
                else false end
          and (p_year is null or extract(year from t.created_at) = p_year)
          and (p_month is null or extract(month from t.created_at) = p_month)
          and (p_admin is null or p_admin='' or t.admin = p_admin)
        group by t.priority
      ) x
    ),
    -- 🔥 adminPerf: group by resolved employee
    'adminPerf', (
      select coalesce(json_agg(row_to_json(x) order by x.pending desc, x.total desc), '[]'::json)
      from (
        select
          coalesce(adm.nickname, adm.first_name, t.admin) as admin,
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
        left join employees e on e.employee_id = t.employee_id
        left join employees adm on (
              coalesce(t.admin,'') <> ''
          and (
                t.admin like adm.employee_id || '\_%' escape '\'
             or t.admin = adm.employee_id
             or t.admin = adm.nickname
             or t.admin = adm.first_name
             or t.admin = coalesce(adm.first_name,'') || ' ' || coalesce(adm.last_name,'')
             or t.admin = coalesce(adm.first_name,'') || ' (' || coalesce(adm.nickname,'') || ')'
          )
        )
        where t.admin is not null and t.admin <> ''
          and case v_role
                when 'manager' then true
                when 'senior_manager' then (case v_scope when 'ICT' then e.company='ICT' when 'Comets' then e.company in ('Comets','JA') else false end)
                when 'officer' then (t.admin = any(v_my_names) or t.admin like emp.employee_id || '\_%' escape '\')
                else false end
          and case v_role
                when 'senior_manager' then (adm.scope_company = v_scope or adm.role = 'manager')
                else true end
          and (p_year is null or extract(year from t.created_at) = p_year)
          and (p_month is null or extract(month from t.created_at) = p_month)
          and (p_admin is null or p_admin='' or t.admin = p_admin)
        group by coalesce(adm.employee_id, t.admin), coalesce(adm.nickname, adm.first_name, t.admin)
      ) x
    ),
    'slaPerf', (
      select json_build_object(
        'total',   count(*) filter (where t.status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว')),
        'onTime',  count(*) filter (where t.status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว') and (t.resolved_at is null or t.due_at is null or t.resolved_at <= t.due_at)),
        'overdue', count(*) filter (where t.status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว') and t.resolved_at is not null and t.due_at is not null and t.resolved_at > t.due_at)
      ) from tickets t
      left join employees e on e.employee_id = t.employee_id
      where case v_role
              when 'manager' then true
              when 'senior_manager' then (case v_scope when 'ICT' then e.company='ICT' when 'Comets' then e.company in ('Comets','JA') else false end)
              when 'officer' then (t.admin = any(v_my_names) or t.admin like emp.employee_id || '\_%' escape '\')
              else false end
        and (p_year is null or extract(year from t.created_at) = p_year)
        and (p_month is null or extract(month from t.created_at) = p_month)
        and (p_admin is null or p_admin='' or t.admin = p_admin)
    )
  );
end;
$body$;

grant execute on function get_dashboard_stats(text, text, int, int, text) to anon, authenticated;

-- ============================================================
-- ทดสอบ: "ปุ๊ก" + "11329_ปุ๊ก" ควรรวมเป็น "ปุ๊ก" แถวเดียว
-- ============================================================
