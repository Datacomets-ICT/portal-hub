-- ============================================================
-- Phase 28: Fix chat permission + chat notification scope
--   - send_ticket_message: รองรับ "11329_ปุ๊ก" format
--   - get_unread_ticket_chats: Sr.Mgr เห็นเฉพาะ ticket ที่ยังไม่ assign (หรือ assign ให้ตัวเอง)
--     ไม่ spam ทุก ticket ใน scope (assignee เท่านั้นเห็น)
-- ============================================================

-- ========== 1) send_ticket_message: officer รองรับ "11329_ปุ๊ก" ==========
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
  admin_matches_me boolean;
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

  -- ตรวจว่า t.admin ตรงกับ emp นี้ไหม (รองรับทุก format)
  admin_matches_me := (
    t.admin is not null and t.admin <> '' and (
         t.admin like emp.employee_id || '\_%' escape '\'
      or t.admin = emp.employee_id
      or t.admin = emp.nickname
      or t.admin = emp.first_name
      or t.admin = coalesce(emp.first_name,'') || ' ' || coalesce(emp.last_name,'')
      or t.admin = coalesce(emp.first_name,'') || ' (' || coalesce(emp.nickname,'') || ')'
    )
  );

  -- ตรวจสิทธิ์
  if emp.employee_id = t.employee_id then
    can_access := true;
  elsif v_role = 'manager' then
    can_access := true;
  elsif v_role = 'senior_manager' then
    select * into reporter from employees where employee_id = t.employee_id;
    if v_scope = 'ICT'    and reporter.company = 'ICT' then can_access := true; end if;
    if v_scope = 'Comets' and reporter.company in ('Comets','JA') then can_access := true; end if;
  elsif v_role = 'officer' then
    if admin_matches_me then can_access := true; end if;
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

-- ========== 2) get_unread_ticket_chats: แชทไป assignee เท่านั้น ==========
-- Logic ใหม่:
--   User            → ticket ของตัวเอง
--   Officer         → ticket ที่ t.admin = ตัวเอง (รวม "11329_ปุ๊ก")
--   Senior Manager  → ticket ใน scope ที่ (a) ยังไม่มี assignee หรือ (b) assignee = ตัวเอง
--                     (ticket ที่ officer ดูแลแล้ว → ไม่เด้ง chat)
--   Manager         → ทุก ticket ที่ยังไม่มี assignee หรือ assignee = ตัวเอง
--                     (ถ้าอยาก oversee chat ของ officer ต้องเข้า ticket detail เอง)
create or replace function get_unread_ticket_chats(p_emp_id text)
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp        employees%rowtype;
  v_role     text;
  v_scope    text;
  v_my_names text[];
  v_my_pref  text;
  result     json;
begin
  select * into emp from employees where employee_id = p_emp_id;
  v_role  := coalesce(emp.role, 'user');
  v_scope := emp.scope_company;

  v_my_names := array_remove(array[
    emp.nickname, emp.first_name, emp.employee_id,
    coalesce(emp.first_name,'') || ' ' || coalesce(emp.last_name,''),
    coalesce(emp.first_name,'') || ' (' || coalesce(emp.nickname,'') || ')'
  ], null);
  v_my_pref := emp.employee_id || '_';

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
        when 'manager'        then (
          coalesce(t.admin,'') = ''                                   -- ยังไม่ assign
          or t.admin = any(v_my_names)                                -- assign ให้ manager (เกิดน้อย)
          or t.admin like v_my_pref || '%'
        )
        when 'senior_manager' then (
          (case v_scope
             when 'ICT'    then reporter.company = 'ICT'
             when 'Comets' then reporter.company in ('Comets','JA')
             else false
           end)
          and (
            coalesce(t.admin,'') = ''                                 -- ยังไม่ assign → Sr.Mgr ดูแล
            or t.admin = any(v_my_names)                              -- assign ให้ Sr.Mgr เอง
            or t.admin like v_my_pref || '%'
          )
        )
        when 'officer' then (
          t.admin = any(v_my_names) or t.admin like v_my_pref || '%'
        )
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
-- หลังรัน:
--   1) Login ปุ๊ก (11329) → ส่งข้อความใน ticket ที่ admin="11329_ปุ๊ก" → สำเร็จ
--   2) Login แชมป์ → ticket ที่ปุ๊กดูแลแล้ว → ไม่เด้ง chat notification (ดูผ่าน ticket detail ได้)
--   3) Login แชมป์ → ticket ที่ยังไม่มี assignee → เด้ง chat ได้
-- ============================================================
