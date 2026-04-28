-- ============================================================
-- Phase 37: Add p_job_type filter to get_tickets_paginated
--
-- The ticket-list page got new "ประเภทงาน / ประเภทปัญหา / อาการ"
-- slicers from the worklist. p_issue_type and p_symptom were already
-- supported in v34; this adds the missing top-level p_job_type so the
-- cascading filter actually narrows results server-side.
--
-- Drop the existing 14-arg signature first, then create the new
-- 15-arg version. Body is otherwise identical to v34 (with the extra
-- p_job_type predicate inlined).
-- ============================================================

drop function if exists get_tickets_paginated(
  text, text, int, int, text, text, text, text, text, text, text, text, text, text);

create or replace function get_tickets_paginated(
  p_emp_id text, p_password text,
  p_limit int default 100, p_offset int default 0,
  p_status text default null, p_search text default null,
  p_plant text default null, p_admin text default null,
  p_date_from text default null, p_date_to text default null,
  p_issue_type text default null, p_symptom text default null,
  p_priority text default null, p_dept text default null,
  p_job_type text default null
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
        and (p_job_type is null or p_job_type='' or coalesce(t.job_type,'ไม่ระบุ') = p_job_type)
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
               t.priority, t.due_at, t.resolved_at, t.photo_urls, t.file_urls, t.reply_photo_urls,
               t.permission_required, t.permission_status, t.permission_doc_url, t.permission_doc_no
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
          and (p_job_type is null or p_job_type='' or coalesce(t.job_type,'ไม่ระบุ') = p_job_type)
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

revoke all on function get_tickets_paginated(
  text, text, int, int, text, text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function get_tickets_paginated(
  text, text, int, int, text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;
