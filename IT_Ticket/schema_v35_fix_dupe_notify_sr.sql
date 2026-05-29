-- ============================================================
-- Phase 35:
--   1) Fix: byAdmin + adminPerf มี ปุ๊ก ซ้ำ (หลาย employee ชื่อเล่นเหมือนกัน)
--      → ใช้ LATERAL JOIN เลือก adm 1 row ต่อ ticket
--   2) request_password_reset → แจ้ง Senior Manager ตาม scope
--      (เดิม notify System — เปลี่ยนเป็น Sr.Mgr → ส่งต่อ line)
-- ============================================================

-- ========== 1) Fix Dashboard duplicate admin ==========
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
    -- 🔥 byAdmin — LATERAL join เอา adm 1 row ต่อ ticket (แก้ duplicate)
    'byAdmin', (
      select coalesce(json_agg(row_to_json(x) order by x.total desc), '[]'::json) from (
        select coalesce(adm.nickname, adm.first_name, coalesce(t.admin,'ยังไม่มอบหมาย')) as admin,
          count(*) as total, count(*) filter (where t.status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว')) as resolved
        from tickets t
        left join employees e on e.employee_id = t.employee_id
        left join lateral (
          select * from employees e2
          where coalesce(t.admin,'') <> ''
            and (
              t.admin like e2.employee_id || '\_%' escape '\'
              or t.admin = e2.employee_id
              or t.admin = e2.nickname
              or t.admin = e2.first_name
              or t.admin = coalesce(e2.first_name,'') || ' ' || coalesce(e2.last_name,'')
              or t.admin = coalesce(e2.first_name,'') || ' (' || coalesce(e2.nickname,'') || ')'
            )
          order by
            case when t.admin like e2.employee_id || '\_%' escape '\' then 1
                 when t.admin = e2.employee_id then 2
                 when e2.role in ('manager','senior_manager','officer','system') then 3
                 else 4 end
          limit 1
        ) adm on true
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
    -- 🔥 adminPerf — LATERAL join (แก้ duplicate)
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
        from tickets t
        left join employees e on e.employee_id = t.employee_id
        left join lateral (
          select * from employees e2
          where coalesce(t.admin,'') <> ''
            and (
              t.admin like e2.employee_id || '\_%' escape '\'
              or t.admin = e2.employee_id
              or t.admin = e2.nickname
              or t.admin = e2.first_name
              or t.admin = coalesce(e2.first_name,'') || ' ' || coalesce(e2.last_name,'')
              or t.admin = coalesce(e2.first_name,'') || ' (' || coalesce(e2.nickname,'') || ')'
            )
          order by
            case when t.admin like e2.employee_id || '\_%' escape '\' then 1
                 when t.admin = e2.employee_id then 2
                 when e2.role in ('manager','senior_manager','officer','system') then 3
                 else 4 end
          limit 1
        ) adm on true
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

-- ========== 2) Update request_password_reset — notify Senior Manager ==========
create or replace function request_password_reset(
  p_emp_id text,
  p_note   text default null
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp employees%rowtype;
  new_req_id bigint;
begin
  select * into emp from employees where employee_id = p_emp_id;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่พบรหัสพนักงานในระบบ');
  end if;

  if exists (select 1 from password_reset_requests
             where employee_id = p_emp_id and status = 'pending') then
    return json_build_object('success', false,
      'message', 'มีคำขอรีเซ็ตรหัสผ่านของคุณค้างอยู่แล้ว รอเจ้าหน้าที่ดำเนินการ');
  end if;

  insert into password_reset_requests(employee_id, requester_name, note)
  values (p_emp_id,
          trim(coalesce(emp.first_name,'') || ' ' || coalesce(emp.last_name,'')),
          p_note)
  returning id into new_req_id;

  -- Notify Senior Manager ตาม scope ของผู้ขอ (+ System เป็น backup)
  insert into notifications(employee_id, ticket_no, title, message)
  select e.employee_id, '', 'คำขอรีเซ็ตรหัสผ่าน',
         p_emp_id || ' — ' ||
         coalesce(emp.first_name,'') || ' ' || coalesce(emp.last_name,'') ||
         ' | ' || coalesce(emp.company,'') ||
         case when p_note is null or p_note = '' then '' else ' | เหตุผล: ' || p_note end
    from employees e
   where e.role = 'senior_manager'
     and (
       (e.scope_company = 'ICT'    and emp.company = 'ICT')
       or (e.scope_company = 'Comets' and emp.company in ('Comets','JA'))
     );

  return json_build_object('success', true,
    'message', 'ส่งคำขอรีเซ็ตรหัสผ่านแล้ว หัวหน้าทีมจะประสานต่อให้',
    'requestId', new_req_id);
end;
$body$;
grant execute on function request_password_reset(text, text) to anon, authenticated;
