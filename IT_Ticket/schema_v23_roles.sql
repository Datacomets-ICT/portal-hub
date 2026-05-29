-- ============================================================
-- Phase 23: 4-tier role hierarchy
--   manager / senior_manager / officer / user
-- ============================================================
--
-- รายละเอียดสิทธิ์:
--   Manager           (เบิร์ด 10375)         → เห็นทุกอย่าง
--   Senior Mgr ICT    (วี 31058)             → เห็น ticket ของ user company=ICT
--   Senior Mgr Comets (แชมป์ — ยังไม่มี ID)  → เห็น ticket ของ user company=Comets หรือ JA
--   Officer Comets    (ปุ๊ก 11329, ยาม้าล ?) → เห็นเฉพาะ ticket ที่ admin=ชื่อตัวเอง
--   User              (ทั่วไป)                → เห็น ticket ตัวเอง
-- ============================================================

-- ========== 1) เพิ่ม columns ใน employees ==========
alter table employees
  add column if not exists role text not null default 'user';

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name='employees' and constraint_name='employees_role_check'
  ) then
    alter table employees add constraint employees_role_check
      check (role in ('manager','senior_manager','officer','user'));
  end if;
end $$;

alter table employees
  add column if not exists scope_company text;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name='employees' and constraint_name='employees_scope_check'
  ) then
    alter table employees add constraint employees_scope_check
      check (scope_company in ('ICT','Comets') or scope_company is null);
  end if;
end $$;

-- ========== 2) Migrate ทีม IT ที่รู้ ID ==========
-- Manager (เบิร์ด)
update employees
   set role='manager', scope_company=null, is_admin=true
 where employee_id='10375';

-- Senior Manager ICT (วี)
update employees
   set role='senior_manager', scope_company='ICT', is_admin=true
 where employee_id='31058';

-- IT Officer Comets (ปุ๊ก)
update employees
   set role='officer', scope_company='Comets', is_admin=true
 where employee_id='11329';

-- ทุกคนอื่นที่ยังไม่ถูก set → role='user'
-- (default เป็น 'user' อยู่แล้ว ไม่ต้องทำอะไร)

-- ========== 3) View ช่วย resolve officer display name ==========
-- Ticket มี field t.admin เก็บเป็น text (ชื่อ admin เช่น "IT07 ปุ๊ก")
-- เราใช้ชื่อ/ชื่อเล่นของ officer ใน filter
create or replace view officer_admin_names as
select
  employee_id,
  -- เก็บทุกรูปแบบที่อาจใช้ใน t.admin
  array_remove(array[
    nickname,
    first_name,
    coalesce(first_name,'') || ' ' || coalesce(last_name,''),
    coalesce(first_name,'') || ' (' || coalesce(nickname,'') || ')'
  ], null) as names
from employees
where role='officer';

-- ========== 4) Updated login() — return role + scope ==========
drop function if exists login(text, text);

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
    return json_build_object('success', false,
      'message', 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง');
  end if;

  if emp.resigned_date is not null then
    return json_build_object('success', false,
      'message', 'บัญชีนี้ถูกปิดการใช้งานแล้ว กรุณาติดต่อฝ่าย IT');
  end if;

  if not coalesce(emp.is_approved, false) then
    return json_build_object('success', false,
      'message', 'บัญชีของคุณยังรอการอนุมัติจากทีม IT กรุณารอสักครู่');
  end if;

  return json_build_object(
    'success', true,
    'user', json_build_object(
      'employeeId',   emp.employee_id,
      'company',      coalesce(emp.company, ''),
      'firstName',    coalesce(emp.first_name, ''),
      'lastName',     coalesce(emp.last_name, ''),
      'department',   coalesce(emp.department, ''),
      'section',      coalesce(emp.section, ''),
      'position',     coalesce(emp.position, ''),
      'nickname',     coalesce(emp.nickname, ''),
      'email',        coalesce(emp.email, ''),
      'phone',        coalesce(emp.phone, ''),
      'role',         coalesce(emp.role, 'user'),
      'scopeCompany', emp.scope_company,
      'isAdmin',      coalesce(emp.is_admin, false)   -- backward compat
    )
  );
end;
$body$;

grant execute on function login(text, text) to anon, authenticated;

-- ========== 5) Helper: scope predicate สำหรับ role-based filter ==========
-- จะถูก inline ใน get_tickets_paginated / get_dashboard_stats
-- logic:
--   manager          → true (ทั้งหมด)
--   senior + ICT     → reporter.company = 'ICT'
--   senior + Comets  → reporter.company in ('Comets','JA')
--   officer          → t.admin ตรงกับชื่อของ officer คนนั้น
--   user             → t.employee_id = p_emp_id

-- ========== 6) get_tickets_paginated — role-based filter ==========
drop function if exists get_tickets_paginated(text, text, int, int, text, text, text, text, text, text, text, text, text, text);

create or replace function get_tickets_paginated(
  p_emp_id      text,
  p_password    text,
  p_limit       int  default 100,
  p_offset      int  default 0,
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
  emp         employees%rowtype;
  v_role      text;
  v_scope     text;
  v_my_names  text[];
  search_pat  text;
  d_from      timestamptz;
  d_to        timestamptz;
  result      json;
begin
  select * into emp from employees
   where employee_id = p_emp_id and password = p_password;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์');
  end if;

  v_role  := coalesce(emp.role, 'user');
  v_scope := emp.scope_company;

  -- Build officer name patterns (ใช้ filter field t.admin)
  if v_role = 'officer' then
    select array_remove(array[
      emp.nickname,
      emp.first_name,
      coalesce(emp.first_name,'') || ' ' || coalesce(emp.last_name,''),
      coalesce(emp.first_name,'') || ' (' || coalesce(emp.nickname,'') || ')'
    ], null)
      into v_my_names;
  end if;

  search_pat := case when p_search is null or p_search='' then null
                     else '%' || lower(p_search) || '%' end;
  d_from     := case when p_date_from is not null and p_date_from<>''
                     then p_date_from::timestamptz else null end;
  d_to       := case when p_date_to   is not null and p_date_to  <>''
                     then (p_date_to::date + 1)::timestamptz else null end;

  select json_build_object(
    'success', true,
    'role',    v_role,
    'scope',   v_scope,
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
      left join employees reporter on reporter.employee_id = t.employee_id
      where
        case v_role
          when 'manager'        then true
          when 'senior_manager' then (
            case v_scope
              when 'ICT'    then reporter.company = 'ICT'
              when 'Comets' then reporter.company in ('Comets','JA')
              else false
            end
          )
          when 'officer'        then t.admin = any(v_my_names)
          else                       t.employee_id = p_emp_id
        end
    ),
    'filtered_total', (
      select count(*) from tickets t
      left join employees e on e.employee_id = t.employee_id
      where
        case v_role
          when 'manager'        then true
          when 'senior_manager' then (
            case v_scope
              when 'ICT'    then e.company = 'ICT'
              when 'Comets' then e.company in ('Comets','JA')
              else false
            end
          )
          when 'officer'        then t.admin = any(v_my_names)
          else                       t.employee_id = p_emp_id
        end
        and (p_status is null or p_status='' or p_status='all' or t.status = p_status)
        and (p_plant  is null or p_plant ='' or t.plant = p_plant or t.location like p_plant || '%')
        and (p_admin  is null or p_admin ='' or t.admin = p_admin)
        and (d_from is null or t.created_at >= d_from)
        and (d_to   is null or t.created_at <  d_to)
        and (p_issue_type is null or p_issue_type='' or coalesce(t.issue_type,'ไม่ระบุ') = p_issue_type)
        and (p_symptom    is null or p_symptom   ='' or coalesce(t.symptom,'ไม่ระบุ')    = p_symptom)
        and (p_priority   is null or p_priority  ='' or coalesce(t.priority,'medium')    = p_priority)
        and (p_dept       is null or p_dept      ='' or coalesce(e.department,'ไม่ระบุ') = p_dept)
        and (search_pat is null or
             lower(coalesce(t.ticket_no,''))     like search_pat or
             lower(coalesce(t.employee_name,'')) like search_pat or
             lower(coalesce(t.employee_id,''))   like search_pat or
             lower(coalesce(t.job_type,''))      like search_pat or
             lower(coalesce(t.issue_type,''))    like search_pat or
             lower(coalesce(t.symptom,''))       like search_pat or
             lower(coalesce(t.request,''))       like search_pat or
             lower(coalesce(t.detail,''))        like search_pat or
             lower(coalesce(t.admin,''))         like search_pat or
             lower(coalesce(t.location,''))      like search_pat or
             lower(coalesce(t.vnc_number,''))    like search_pat)
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
        where
          case v_role
            when 'manager'        then true
            when 'senior_manager' then (
              case v_scope
                when 'ICT'    then e.company = 'ICT'
                when 'Comets' then e.company in ('Comets','JA')
                else false
              end
            )
            when 'officer'        then t.admin = any(v_my_names)
            else                       t.employee_id = p_emp_id
          end
          and (p_status is null or p_status='' or p_status='all' or t.status = p_status)
          and (p_plant  is null or p_plant ='' or t.plant = p_plant or t.location like p_plant || '%')
          and (p_admin  is null or p_admin ='' or t.admin = p_admin)
          and (d_from is null or t.created_at >= d_from)
          and (d_to   is null or t.created_at <  d_to)
          and (p_issue_type is null or p_issue_type='' or coalesce(t.issue_type,'ไม่ระบุ') = p_issue_type)
          and (p_symptom    is null or p_symptom   ='' or coalesce(t.symptom,'ไม่ระบุ')    = p_symptom)
          and (p_priority   is null or p_priority  ='' or coalesce(t.priority,'medium')    = p_priority)
          and (p_dept       is null or p_dept      ='' or coalesce(e.department,'ไม่ระบุ') = p_dept)
          and (search_pat is null or
               lower(coalesce(t.ticket_no,''))     like search_pat or
               lower(coalesce(t.employee_name,'')) like search_pat or
               lower(coalesce(t.employee_id,''))   like search_pat or
               lower(coalesce(t.job_type,''))      like search_pat or
               lower(coalesce(t.issue_type,''))    like search_pat or
               lower(coalesce(t.symptom,''))       like search_pat or
               lower(coalesce(t.request,''))       like search_pat or
               lower(coalesce(t.detail,''))        like search_pat or
               lower(coalesce(t.admin,''))         like search_pat or
               lower(coalesce(t.location,''))      like search_pat or
               lower(coalesce(t.vnc_number,''))    like search_pat)
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

-- ========== 7) get_dashboard_stats — role-based filter ==========
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

  -- Dashboard เข้าได้เฉพาะ role ที่มีสิทธิ์ดู (ไม่ใช่ user ทั่วไป)
  if v_role not in ('manager','senior_manager','officer') then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์เข้า Dashboard');
  end if;

  if v_role = 'officer' then
    select array_remove(array[
      emp.nickname,
      emp.first_name,
      coalesce(emp.first_name,'') || ' ' || coalesce(emp.last_name,''),
      coalesce(emp.first_name,'') || ' (' || coalesce(emp.nickname,'') || ')'
    ], null)
      into v_my_names;
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
                when 'manager'        then true
                when 'senior_manager' then (
                  case v_scope
                    when 'ICT'    then e.company = 'ICT'
                    when 'Comets' then e.company in ('Comets','JA')
                    else false
                  end
                )
                when 'officer'        then t.admin = any(v_my_names)
                else false
              end
          and (p_year  is null or extract(year  from t.created_at) = p_year)
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
                when 'manager'        then true
                when 'senior_manager' then (
                  case v_scope
                    when 'ICT'    then e.company = 'ICT'
                    when 'Comets' then e.company in ('Comets','JA')
                    else false
                  end
                )
                when 'officer'        then t.admin = any(v_my_names)
                else false
              end
          and (p_year  is null or extract(year  from t.created_at) = p_year)
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
                when 'manager'        then true
                when 'senior_manager' then (
                  case v_scope
                    when 'ICT'    then e.company = 'ICT'
                    when 'Comets' then e.company in ('Comets','JA')
                    else false
                  end
                )
                when 'officer'        then t.admin = any(v_my_names)
                else false
              end
          and (p_year  is null or extract(year  from t.created_at) = p_year)
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
                when 'manager'        then true
                when 'senior_manager' then (
                  case v_scope
                    when 'ICT'    then e.company = 'ICT'
                    when 'Comets' then e.company in ('Comets','JA')
                    else false
                  end
                )
                when 'officer'        then t.admin = any(v_my_names)
                else false
              end
          and (p_year  is null or extract(year  from t.created_at) = p_year)
          and (p_month is null or extract(month from t.created_at) = p_month)
          and (p_admin is null or p_admin='' or t.admin = p_admin)
        group by t.symptom order by count(*) desc limit 10
      ) x
    ),
    'byAdmin', (
      select coalesce(json_agg(row_to_json(x) order by x.total desc), '[]'::json)
      from (
        select coalesce(t.admin,'ยังไม่มอบหมาย') as admin, count(*) as total,
               count(*) filter (where t.status in ('ดำเนินการเรียบร้อย','ปิดงานแล้ว')) as resolved
        from tickets t
        left join employees e on e.employee_id = t.employee_id
        where case v_role
                when 'manager'        then true
                when 'senior_manager' then (
                  case v_scope
                    when 'ICT'    then e.company = 'ICT'
                    when 'Comets' then e.company in ('Comets','JA')
                    else false
                  end
                )
                when 'officer'        then t.admin = any(v_my_names)
                else false
              end
          and (p_year  is null or extract(year  from t.created_at) = p_year)
          and (p_month is null or extract(month from t.created_at) = p_month)
          and (p_admin is null or p_admin='' or t.admin = p_admin)
        group by t.admin
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
                when 'manager'        then true
                when 'senior_manager' then (
                  case v_scope
                    when 'ICT'    then e.company = 'ICT'
                    when 'Comets' then e.company in ('Comets','JA')
                    else false
                  end
                )
                when 'officer'        then t.admin = any(v_my_names)
                else false
              end
          and (p_year  is null or extract(year  from t.created_at) = p_year)
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
                when 'manager'        then true
                when 'senior_manager' then (
                  case v_scope
                    when 'ICT'    then e.company = 'ICT'
                    when 'Comets' then e.company in ('Comets','JA')
                    else false
                  end
                )
                when 'officer'        then t.admin = any(v_my_names)
                else false
              end
          and (p_year  is null or extract(year  from t.created_at) = p_year)
          and (p_month is null or extract(month from t.created_at) = p_month)
          and (p_admin is null or p_admin='' or t.admin = p_admin)
        group by t.priority
      ) x
    ),
    'adminPerf', (
      select coalesce(json_agg(row_to_json(x) order by x.pending desc, x.total desc), '[]'::json)
      from (
        select
          coalesce(t.admin,'ยังไม่มอบหมาย') as admin,
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
        where t.admin is not null and t.admin <> ''
          and case v_role
                when 'manager'        then true
                when 'senior_manager' then (
                  case v_scope
                    when 'ICT'    then e.company = 'ICT'
                    when 'Comets' then e.company in ('Comets','JA')
                    else false
                  end
                )
                when 'officer'        then t.admin = any(v_my_names)
                else false
              end
          and (p_year  is null or extract(year  from t.created_at) = p_year)
          and (p_month is null or extract(month from t.created_at) = p_month)
          and (p_admin is null or p_admin='' or t.admin = p_admin)
        group by t.admin
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
              when 'manager'        then true
              when 'senior_manager' then (
                case v_scope
                  when 'ICT'    then e.company = 'ICT'
                  when 'Comets' then e.company in ('Comets','JA')
                  else false
                end
              )
              when 'officer'        then t.admin = any(v_my_names)
              else false
            end
        and (p_year  is null or extract(year  from t.created_at) = p_year)
        and (p_month is null or extract(month from t.created_at) = p_month)
        and (p_admin is null or p_admin='' or t.admin = p_admin)
    )
  );
end;
$body$;

grant execute on function get_dashboard_stats(text, text, int, int, text) to anon, authenticated;

-- ============================================================
-- ตรวจสอบหลังรัน: ลองคิวรี่ดู
--   select employee_id, first_name, nickname, role, scope_company, is_admin
--     from employees where role <> 'user';
-- ควรได้ 3 rows: เบิร์ด (manager), วี (senior_manager/ICT), ปุ๊ก (officer/Comets)
-- ============================================================
