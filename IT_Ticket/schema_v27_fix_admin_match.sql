-- ============================================================
-- Phase 27: Fix t.admin matching for "{empID}_{nickname}" format
-- ============================================================

-- ========== update_ticket — notify officer ที่ admin "11329_ปุ๊ก" format ==========
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
  assigned_emp employees%rowtype;
begin
  select * into emp from employees
   where employee_id = p_emp_id and password = p_password;
  is_adm := coalesce(emp.is_admin, false)
         or coalesce(emp.role, 'user') in ('manager','senior_manager','officer');
  if not is_adm then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์');
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

  -- Status Rules (v26)
  if new_status = 'ยกเลิก' and old_row.status <> 'ยกเลิก' then
    return json_build_object('success', false, 'message', 'ไม่สามารถยกเลิก Ticket ได้ — ต้องให้ผู้แจ้งยกเลิกเอง');
  end if;
  if new_status = 'เปิด Ticket' and old_row.status not in ('เปิด Ticket') then
    return json_build_object('success', false, 'message', 'ไม่สามารถย้อนสถานะกลับเป็น "เปิด Ticket"');
  end if;
  if old_row.status = 'ปิดงานแล้ว' and new_status <> 'ปิดงานแล้ว' then
    return json_build_object('success', false, 'message', 'Ticket ปิดงานแล้ว แก้ไขไม่ได้');
  end if;

  begin
    select array_agg(x::text) into new_reply_photos
    from json_array_elements_text(coalesce(payload->'replyPhotos', old_row.reply_photo_urls::json)) x;
  exception when others then
    new_reply_photos := old_row.reply_photo_urls;
  end;

  admin_label := trim(coalesce(emp.first_name,'') || ' ' || coalesce(emp.last_name,''));
  if admin_label = '' then admin_label := emp.employee_id; end if;

  -- History
  if coalesce(old_row.status,'') <> coalesce(new_status,'') then
    insert into ticket_history(ticket_key, ticket_no, changed_by_id, changed_by_name, field, old_value, new_value)
    values (tid, old_row.ticket_no, emp.employee_id, admin_label, 'status', old_row.status, new_status);
  end if;
  if coalesce(old_row.admin,'') <> coalesce(new_admin,'') then
    insert into ticket_history(ticket_key, ticket_no, changed_by_id, changed_by_name, field, old_value, new_value)
    values (tid, old_row.ticket_no, emp.employee_id, admin_label, 'admin', old_row.admin, new_admin);
  end if;
  if coalesce(old_row.reply,'') <> coalesce(new_reply,'') then
    insert into ticket_history(ticket_key, ticket_no, changed_by_id, changed_by_name, field, old_value, new_value)
    values (tid, old_row.ticket_no, emp.employee_id, admin_label, 'reply', old_row.reply, new_reply);
  end if;
  if coalesce(old_row.priority,'') <> coalesce(new_priority,'') then
    insert into ticket_history(ticket_key, ticket_no, changed_by_id, changed_by_name, field, old_value, new_value)
    values (tid, old_row.ticket_no, emp.employee_id, admin_label, 'priority', old_row.priority, new_priority);
  end if;

  update tickets set
    status           = new_status,
    admin            = new_admin,
    reply            = new_reply,
    priority         = new_priority,
    reply_photo_urls = new_reply_photos
   where key = tid;

  -- Notify ผู้แจ้ง
  if old_row.employee_id is not null and old_row.employee_id <> '' then
    notif_msg := '';
    if coalesce(old_row.status,'') <> coalesce(new_status,'') then
      notif_msg := 'สถานะเปลี่ยนเป็น "' || new_status || '"';
    end if;
    if coalesce(old_row.admin,'') <> coalesce(new_admin,'') and new_admin is not null then
      if notif_msg <> '' then notif_msg := notif_msg || ' / '; end if;
      notif_msg := notif_msg || 'ผู้รับผิดชอบ: ' || new_admin;
    end if;
    if coalesce(old_row.reply,'') <> coalesce(new_reply,'') and new_reply is not null and new_reply <> '' then
      if notif_msg <> '' then notif_msg := notif_msg || ' / '; end if;
      notif_msg := notif_msg || 'วิธีแก้ไข: ' || left(new_reply,100);
    end if;
    if notif_msg <> '' then
      insert into notifications(employee_id, ticket_no, title, message)
      values (old_row.employee_id, old_row.ticket_no,
              'Ticket ' || old_row.ticket_no || ' มีการอัพเดท', notif_msg);
    end if;
  end if;

  -- Notify officer ที่ถูก assign (รองรับ "11329_ปุ๊ก" + "ปุ๊ก" format)
  if coalesce(old_row.admin,'') <> coalesce(new_admin,'')
     and new_admin is not null and new_admin <> '' then
    select * into assigned_emp from employees e
     where e.role = 'officer'
       and (
         new_admin like e.employee_id || '\_%' escape '\'   -- "11329_xxx"
         or new_admin = e.employee_id                        -- "11329"
         or new_admin = e.nickname                           -- "ปุ๊ก"
         or new_admin = e.first_name
         or new_admin = coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')
         or new_admin = coalesce(e.first_name,'') || ' (' || coalesce(e.nickname,'') || ')'
       )
     limit 1;
    if found then
      insert into notifications(employee_id, ticket_no, title, message)
      values (assigned_emp.employee_id, old_row.ticket_no,
              'คุณได้รับงาน Ticket ใหม่',
              old_row.ticket_no || ' — ' || coalesce(old_row.request,''));
    end if;
  end if;

  return json_build_object('success', true);
end;
$body$;

grant execute on function update_ticket(text, text, json) to anon, authenticated;

-- ========== get_tickets_paginated — officer filter รองรับ "11329_ปุ๊ก" ==========
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
  v_my_id_pref text;
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

  if v_role = 'officer' then
    v_my_names := array_remove(array[
      emp.nickname, emp.first_name, emp.employee_id,
      coalesce(emp.first_name,'') || ' ' || coalesce(emp.last_name,''),
      coalesce(emp.first_name,'') || ' (' || coalesce(emp.nickname,'') || ')'
    ], null);
    v_my_id_pref := emp.employee_id || '_';
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
          when 'officer'        then (t.admin = any(v_my_names) or t.admin like v_my_id_pref || '%')
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
          when 'officer'        then (t.admin = any(v_my_names) or t.admin like v_my_id_pref || '%')
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
            when 'officer'        then (t.admin = any(v_my_names) or t.admin like v_my_id_pref || '%')
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

-- ============================================================
-- หลังรัน:
--   1) Assign ticket ให้ "11329_ปุ๊ก" → ปุ๊ก ได้ notification
--   2) Login ปุ๊ก → เห็น ticket ทั้งที่ admin = "ปุ๊ก" และ "11329_ปุ๊ก"
-- ============================================================
