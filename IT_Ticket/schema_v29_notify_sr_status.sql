-- ============================================================
-- Phase 29: Notify Sr.Mgr on status change (after assigned to Officer)
--   Sr.Mgr จะได้แจ้งเตือนทุกครั้งที่ Officer ปรับสถานะ Ticket
--   (แค่แจ้งให้รู้ ไม่ spam chat)
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
  reporter     employees%rowtype;
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

  -- Status Rules
  if new_status = 'ยกเลิก' and old_row.status <> 'ยกเลิก' then
    return json_build_object('success', false, 'message', 'ไม่สามารถยกเลิก Ticket ได้ — ต้องให้ผู้แจ้งยกเลิกเอง');
  end if;
  if new_status = 'เปิด Ticket' and old_row.status not in ('เปิด Ticket') then
    return json_build_object('success', false, 'message', 'ไม่สามารถย้อนสถานะกลับเป็น "เปิด Ticket"');
  end if;
  if old_row.status = 'ปิดงานแล้ว' and new_status <> 'ปิดงานแล้ว' then
    return json_build_object('success', false, 'message', 'Ticket ปิดงานแล้ว แก้ไขไม่ได้');
  end if;

  -- Officer ห้ามแก้ admin/priority (เผื่อ bypass UI)
  if coalesce(emp.role,'user') = 'officer' then
    if coalesce(old_row.admin,'') <> coalesce(new_admin,'') then
      return json_build_object('success', false, 'message', 'Officer ไม่มีสิทธิ์เปลี่ยนผู้รับผิดชอบ');
    end if;
    if coalesce(old_row.priority,'') <> coalesce(new_priority,'') then
      return json_build_object('success', false, 'message', 'Officer ไม่มีสิทธิ์เปลี่ยน Priority');
    end if;
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

  -- Notify ผู้แจ้ง (user)
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

  -- Notify officer ที่ถูก assign (รองรับ "11329_ปุ๊ก" format)
  if coalesce(old_row.admin,'') <> coalesce(new_admin,'')
     and new_admin is not null and new_admin <> '' then
    select * into assigned_emp from employees e
     where e.role = 'officer'
       and (
         new_admin like e.employee_id || '\_%' escape '\'
         or new_admin = e.employee_id
         or new_admin = e.nickname
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

  -- ✨ NEW: Notify Sr.Mgr on status change (ถ้า status เปลี่ยน + ticket มี assignee แล้ว)
  -- ใช้ company ของ reporter กำหนด scope ของ Sr.Mgr ที่ควร notify
  if coalesce(old_row.status,'') <> coalesce(new_status,'')
     and coalesce(new_admin,'') <> '' then
    select * into reporter from employees where employee_id = old_row.employee_id;
    insert into notifications(employee_id, ticket_no, title, message)
    select e.employee_id,
           old_row.ticket_no,
           'อัปเดตสถานะ Ticket ' || old_row.ticket_no,
           'ผู้ดำเนินการ ' || admin_label ||
           ' เปลี่ยนสถานะเป็น "' || new_status || '"'
      from employees e
     where e.role = 'senior_manager'
       and e.employee_id <> p_emp_id    -- ไม่ notify คนที่ทำเอง
       and (
            (e.scope_company = 'ICT'    and reporter.company = 'ICT')
         or (e.scope_company = 'Comets' and reporter.company in ('Comets','JA'))
       );
  end if;

  return json_build_object('success', true);
end;
$body$;

grant execute on function update_ticket(text, text, json) to anon, authenticated;

-- ============================================================
-- ทดสอบ:
--   1) Login ปุ๊ก → เปลี่ยนสถานะ Ticket → แชมป์ได้แจ้งเตือน "ผู้ดำเนินการ ปุ๊ก เปลี่ยนสถานะเป็น ..."
--   2) Login ปุ๊ก → พยายามเปลี่ยน priority → error "Officer ไม่มีสิทธิ์เปลี่ยน Priority"
-- ============================================================
