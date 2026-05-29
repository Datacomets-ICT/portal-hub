-- ============================================================
-- Phase 25: Role-based notifications + chat filtering
--   - create_ticket: notify แค่คนที่อยู่ใน scope
--   - update_ticket: เพิ่ม notify officer เมื่อถูก assign
--   - send_ticket_message: verify access ตาม role
--   - get_unread_ticket_chats: filter ตาม role
-- ============================================================

-- ========== 1) create_ticket: role-based notification ==========
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
  reporter_company text;
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

  -- หา company ของผู้แจ้ง
  select company into reporter_company
    from employees
   where employee_id = payload->>'employeeId';

  -- Notify เฉพาะ Manager + Sr.Mgr ที่ scope ตรงกับ reporter
  --   Manager → notify เสมอ
  --   Senior Manager ICT → notify ถ้า reporter.company = 'ICT'
  --   Senior Manager Comets → notify ถ้า reporter.company in ('Comets', 'JA')
  --   Officer → ไม่ notify ตอน create (รอถูก assign ก่อน)
  insert into notifications (employee_id, ticket_no, title, message)
  select e.employee_id,
         new_ticket_no,
         'Ticket ใหม่',
         new_ticket_no || ' — ' || left(coalesce(payload->>'request',''), 100)
    from employees e
   where e.role = 'manager'
      or (e.role = 'senior_manager' and (
           (e.scope_company = 'ICT'    and reporter_company = 'ICT')
        or (e.scope_company = 'Comets' and reporter_company in ('Comets','JA'))
      ));

  return json_build_object('success', true, 'ticketId', new_ticket_no);
end;
$body$;

grant execute on function create_ticket(json) to anon, authenticated;

-- ========== 2) update_ticket: notify officer เมื่อถูก assign ==========
-- (overwrite ของเดิม, เพิ่ม notification ให้ officer ที่ถูก assign ใหม่)
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

  -- Notify officer ที่ถูก assign ใหม่
  if coalesce(old_row.admin,'') <> coalesce(new_admin,'')
     and new_admin is not null and new_admin <> '' then
    -- หา employee ที่ตรงกับชื่อใน new_admin (nickname หรือ first_name)
    select * into assigned_emp from employees
     where role = 'officer'
       and (new_admin = any(array_remove(array[
             nickname, first_name,
             coalesce(first_name,'') || ' ' || coalesce(last_name,''),
             coalesce(first_name,'') || ' (' || coalesce(nickname,'') || ')'
           ], null)))
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

-- ========== 3) send_ticket_message: verify role-based access ==========
create or replace function send_ticket_message(
  p_emp_id          text,
  p_password        text,
  p_ticket_key      bigint,
  p_message         text,
  p_attachment_url  text default null,
  p_attachment_name text default null,
  p_attachment_type text default null
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp            employees%rowtype;
  t              tickets%rowtype;
  reporter       employees%rowtype;
  sender_display text;
  v_role         text;
  v_scope        text;
  can_access     boolean := false;
  my_names       text[];
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

  v_role  := coalesce(emp.role, 'user');
  v_scope := emp.scope_company;

  -- ตรวจสิทธิ์
  if emp.employee_id = t.employee_id then
    can_access := true;                                 -- เจ้าของ ticket
  elsif v_role = 'manager' then
    can_access := true;                                 -- manager ทุกเรื่อง
  elsif v_role = 'senior_manager' then
    select * into reporter from employees where employee_id = t.employee_id;
    if v_scope = 'ICT'    and reporter.company = 'ICT' then can_access := true; end if;
    if v_scope = 'Comets' and reporter.company in ('Comets','JA') then can_access := true; end if;
  elsif v_role = 'officer' then
    my_names := array_remove(array[
      emp.nickname, emp.first_name,
      coalesce(emp.first_name,'') || ' ' || coalesce(emp.last_name,''),
      coalesce(emp.first_name,'') || ' (' || coalesce(emp.nickname,'') || ')'
    ], null);
    if t.admin = any(my_names) then can_access := true; end if;
  end if;

  if not can_access then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์ส่งข้อความใน Ticket นี้');
  end if;

  sender_display := trim(coalesce(emp.nickname,'') || ' ' || coalesce(emp.first_name,''));
  if sender_display = '' then sender_display := emp.employee_id; end if;

  insert into ticket_messages(
    ticket_key, ticket_no, sender_id, sender_name, is_admin, message,
    attachment_url, attachment_name, attachment_type
  ) values (
    p_ticket_key, t.ticket_no, emp.employee_id, sender_display,
    v_role <> 'user',
    coalesce(p_message, ''),
    p_attachment_url, p_attachment_name, p_attachment_type
  );

  insert into ticket_message_reads(employee_id, ticket_key, last_read_at)
  values (p_emp_id, p_ticket_key, now())
  on conflict (employee_id, ticket_key) do update set last_read_at = now();

  return json_build_object('success', true);
end;
$body$;

grant execute on function send_ticket_message(text, text, bigint, text, text, text, text) to anon, authenticated;

-- ========== 4) get_unread_ticket_chats: filter ตาม role ==========
create or replace function get_unread_ticket_chats(p_emp_id text)
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp       employees%rowtype;
  v_role    text;
  v_scope   text;
  my_names  text[];
  result    json;
begin
  select * into emp from employees where employee_id = p_emp_id;
  v_role  := coalesce(emp.role, 'user');
  v_scope := emp.scope_company;

  if v_role = 'officer' then
    my_names := array_remove(array[
      emp.nickname, emp.first_name,
      coalesce(emp.first_name,'') || ' ' || coalesce(emp.last_name,''),
      coalesce(emp.first_name,'') || ' (' || coalesce(emp.nickname,'') || ')'
    ], null);
  end if;

  select json_agg(row_to_json(x)) into result
  from (
    select
      tm.ticket_key    as "ticketKey",
      tm.ticket_no     as "ticketNo",
      count(*) filter (where tm.sender_id <> p_emp_id
                       and tm.created_at > coalesce(r.last_read_at, '1970-01-01'::timestamptz))::int as "unreadCount",
      max(tm.created_at) as "lastAt",
      (array_agg(
        case
          when tm.attachment_type = 'image' then '📷 ' || coalesce(nullif(tm.message,''), 'ส่งรูปภาพ')
          when tm.attachment_type = 'file'  then '📎 ' || coalesce(tm.attachment_name, 'ไฟล์แนบ')
          else tm.message
        end
        order by tm.created_at desc))[1] as "lastMessage",
      (array_agg(tm.sender_name order by tm.created_at desc))[1] as "lastSender"
    from ticket_messages tm
    join tickets t on t.key = tm.ticket_key
    left join employees reporter on reporter.employee_id = t.employee_id
    left join ticket_message_reads r on r.ticket_key = tm.ticket_key and r.employee_id = p_emp_id
    where
      case v_role
        when 'user'           then t.employee_id = p_emp_id
        when 'manager'        then true
        when 'senior_manager' then (
          case v_scope
            when 'ICT'    then reporter.company = 'ICT'
            when 'Comets' then reporter.company in ('Comets','JA')
            else false
          end
        )
        when 'officer'        then t.admin = any(my_names)
        else                       t.employee_id = p_emp_id
      end
    group by tm.ticket_key, tm.ticket_no, r.last_read_at
    order by max(tm.created_at) desc
    limit 50
  ) x;

  return coalesce(result, '[]'::json);
end;
$body$;

grant execute on function get_unread_ticket_chats(text) to anon, authenticated;

-- ============================================================
-- ทดสอบหลังรัน:
--   1) Login เบิร์ด (10375) → เห็น Ticket + notification ทุกคน
--   2) Login วี (31058)    → เห็นเฉพาะ ICT
--   3) Login ปุ๊ก (11329)  → เห็นเฉพาะงานที่ admin=ปุ๊ก
--   4) User ทั่วไป         → เห็นเฉพาะของตัวเอง
-- ============================================================
