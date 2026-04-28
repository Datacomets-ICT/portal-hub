-- ============================================================
-- Phase 36: Permission slip (ใบขอสิทธิ์) tracking
--
--   - worklist.needs_permission = mark issues that REQUIRE a permission
--     slip (sourced from Worklist1.xlsx column "ทำใบขอสิทธ์ไหม")
--   - tickets gets 4 new columns to record the slip itself + status
--   - create_ticket auto-flags new tickets based on the worklist match
--   - update_ticket accepts permissionStatus / permissionDocUrl /
--     permissionDocNo so admins can attach the slip retroactively
--
--   Safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE
--   and the seed UPDATE is idempotent.
-- ============================================================

-- ===== 1. Schema additions =====

alter table worklist
  add column if not exists needs_permission boolean not null default false;

alter table tickets
  add column if not exists permission_required boolean default false,
  add column if not exists permission_status   text    default 'not_required',
  add column if not exists permission_doc_url  text,
  add column if not exists permission_doc_no   text;

-- Helpful for "tickets ที่ยังต้องส่งใบขอสิทธิ์" filters / dashboards
create index if not exists tickets_perm_pending_idx
  on tickets(permission_status)
  where permission_required = true and permission_status <> 'approved';

-- ===== 2. Seed: mark which worklist rows need a permission slip =====
-- Source: IT_Ticket/Worklist1.xlsx — rows with "ทำใบขอสิทธ์ไหม" = "ทำ"
-- COALESCE is needed because some symptoms in the master list are blank
-- but stored as either NULL or '' depending on prior load.

-- Reset all to false first so removing rows from the master un-flags them
update worklist set needs_permission = false where needs_permission = true;

with _seed (job_type, issue_type, symptom) as (values
  ('คอมพิวเตอร์', 'Notebook', 'หน้าจอฟ้า'),
  ('คอมพิวเตอร์', 'Notebook', 'เครื่องเปิดไม่ติด'),
  ('คอมพิวเตอร์', 'Notebook', 'เครื่องช้า'),
  ('คอมพิวเตอร์', 'Notebook', 'Notebook ไม่เก็บไฟ'),
  ('คอมพิวเตอร์', 'Notebook', 'ชาร์จไฟไม่เข้า'),
  ('คอมพิวเตอร์', 'Notebook', 'ล็อกอินไม่ได้'),
  ('คอมพิวเตอร์', 'Notebook', 'อื่นๆ (โปรดระบุ)'),
  ('คอมพิวเตอร์', 'PC', 'หน้าจอฟ้า'),
  ('คอมพิวเตอร์', 'PC', 'เครื่องเปิดไม่ติด'),
  ('คอมพิวเตอร์', 'PC', 'เครื่องช้า'),
  ('คอมพิวเตอร์', 'PC', 'ล็อกอินไม่ได้'),
  ('คอมพิวเตอร์', 'PC', 'อื่นๆ (โปรดระบุ)'),
  ('คอมพิวเตอร์', 'Macbook', 'หน้าจอฟ้า'),
  ('คอมพิวเตอร์', 'Macbook', 'เครื่องเปิดไม่ติด'),
  ('คอมพิวเตอร์', 'Macbook', 'เครื่องช้า'),
  ('คอมพิวเตอร์', 'Macbook', 'เครื่องไม่เก็บไฟ'),
  ('คอมพิวเตอร์', 'Macbook', 'ชาร์จไฟไม่เข้า'),
  ('คอมพิวเตอร์', 'Macbook', 'ล็อกอินไม่ได้'),
  ('คอมพิวเตอร์', 'Macbook', 'อื่นๆ (โปรดระบุ)'),
  ('คอมพิวเตอร์', 'iMac', 'หน้าจอฟ้า'),
  ('คอมพิวเตอร์', 'iMac', 'เครื่องเปิดไม่ติด'),
  ('คอมพิวเตอร์', 'iMac', 'เครื่องช้า'),
  ('คอมพิวเตอร์', 'iMac', 'เครื่องไม่เก็บไฟ'),
  ('คอมพิวเตอร์', 'iMac', 'ล็อกอินไม่ได้'),
  ('คอมพิวเตอร์', 'iMac', 'อื่นๆ (โปรดระบุ)'),
  ('ปริ้นเตอร์', 'Printer 1', 'ขอสิทธิ์ปริ้นเตอร์'),
  ('ปริ้นเตอร์', 'Printer 2', 'ขอสิทธิ์ปริ้นเตอร์'),
  ('ปริ้นเตอร์', 'Printer 3', 'ขอสิทธิ์ปริ้นเตอร์'),
  ('ปริ้นเตอร์', 'Printer FAC', 'ขอสิทธิ์ปริ้นเตอร์'),
  ('ปริ้นเตอร์', 'Printer แผนก', 'หมึกหมด'),
  ('ปริ้นเตอร์', 'ปริ้นเตอร์อื่นๆ', 'หมึกหมด'),
  ('อุปกรณ์ไอที', 'คีย์บอร์ด', 'พิมพ์ไม่ติด'),
  ('อุปกรณ์ไอที', 'คีย์บอร์ด', 'พิมพ์แล้วอักษรไม่ตรง'),
  ('อุปกรณ์ไอที', 'คีย์บอร์ด', 'อื่นๆ (โปรดระบุ)'),
  ('อุปกรณ์ไอที', 'เมาส์', 'เมาส์ไม่ติด'),
  ('อุปกรณ์ไอที', 'เมาส์', 'เมาส์กดคลิ๊กซ้ายไม่ได้'),
  ('อุปกรณ์ไอที', 'เมาส์', 'เมาส์กดคลิ๊กขวาไม่ได้'),
  ('อุปกรณ์ไอที', 'เมาส์', 'ลากเมาส์แล้วช้า'),
  ('อุปกรณ์ไอที', 'เมาส์', 'อื่นๆ (โปรดระบุ)'),
  ('อุปกรณ์ไอที', 'สายชาร์จ', 'ยืมสายชาร์จ'),
  ('อุปกรณ์ไอที', 'สายชาร์จ', 'เปลี่ยนสายชาร์จใหม่'),
  ('อุปกรณ์ไอที', 'สายชาร์จ', 'อื่นๆ (โปรดระบุ)'),
  ('อุปกรณ์ไอที', 'จอคอมพิวเตอร์', 'หน้าจอเปิดไม่ติด'),
  ('อุปกรณ์ไอที', 'จอคอมพิวเตอร์', 'หน้าจอมีปัญหา'),
  ('อุปกรณ์ไอที', 'จอคอมพิวเตอร์', 'อื่นๆ (โปรดระบุ)'),
  ('อุปกรณ์ไอที', 'เครื่องสำรองไฟ', 'เครื่องเปิดไม่ติด'),
  ('อุปกรณ์ไอที', 'เครื่องสำรองไฟ', 'เครื่องไม่สำรองไฟ'),
  ('อุปกรณ์ไอที', 'เครื่องสำรองไฟ', 'เครื่องมีเสียงร้อง'),
  ('อุปกรณ์ไอที', 'เครื่องสำรองไฟ', 'อื่นๆ (โปรดระบุ)'),
  ('อุปกรณ์ไอที', 'ทีวี', 'เปิดไม่ติด'),
  ('อุปกรณ์ไอที', 'ทีวี', 'อื่นๆ (โปรดระบุ)'),
  ('อุปกรณ์ไอที', 'ไมโครโฟน', 'อื่นๆ (โปรดระบุ)'),
  ('อุปกรณ์ไอที', 'โปรเจคเตอร์', 'เปิดไม่ติด'),
  ('อุปกรณ์ไอที', 'โปรเจคเตอร์', 'อื่นๆ (โปรดระบุ)'),
  ('อุปกรณ์ไอที', 'กล้องวงจรปิด', 'กล้องไม่ติด'),
  ('อุปกรณ์ไอที', 'กล้องวงจรปิด', 'ดูผ่านแอพไม่ได้'),
  ('อุปกรณ์ไอที', 'กล้องวงจรปิด', 'อื่นๆ (โปรดระบุ)'),
  ('อุปกรณ์ไอที', 'เครื่องสแกนหน้า / นิ้ว', 'เครื่องดับ'),
  ('อุปกรณ์ไอที', 'เครื่องสแกนหน้า / นิ้ว', 'สแกนไม่ติด'),
  ('อุปกรณ์ไอที', 'เครื่องสแกนหน้า / นิ้ว', 'ดึงข้อมูลไม่ได้'),
  ('อุปกรณ์ไอที', 'เครื่องสแกนหน้า / นิ้ว', 'อื่นๆ (โปรดระบุ)'),
  ('ปัญหาโปรแกรม', 'ติดตั้งโปรแกรม', 'ระบุโปรแกรม'),
  ('ปัญหาโปรแกรม', 'Email', 'เปิดโปรแกรมไม่ได้'),
  ('ปัญหาโปรแกรม', 'Email', 'ไม่สามารถรับ / ส่งอีเมลได้'),
  ('ปัญหาโปรแกรม', 'Email', 'อีเมลเต็ม (แบ็คอัพอีเมล)'),
  ('ปัญหาโปรแกรม', 'Email', 'ภาษาเพี้ยน'),
  ('ปัญหาโปรแกรม', 'Email', 'เปิดใช้งานอีเมล'),
  ('ปัญหาโปรแกรม', 'Email', 'ยกเลิกอีเมล'),
  ('ปัญหาโปรแกรม', 'Email', 'อื่นๆ (โปรดระบุ)'),
  ('ปัญหาโปรแกรม', E'Microsoft Office\n(Word, Excel, Power Point)', 'เปิดโปรแกรมไม่ได้'),
  ('ปัญหาโปรแกรม', E'Microsoft Office\n(Word, Excel, Power Point)', 'Save ไฟล์ไม่ได้'),
  ('ปัญหาโปรแกรม', E'Microsoft Office\n(Word, Excel, Power Point)', 'ไฟล์งานเสียหาย'),
  ('ปัญหาโปรแกรม', E'Microsoft Office\n(Word, Excel, Power Point)', 'อื่นๆ (โปรดระบุ)'),
  ('ปัญหาโปรแกรม', 'SAP', 'ล็อกอินไม่ได้'),
  ('ปัญหาโปรแกรม', 'SAP', 'เปลี่ยนรหัสผ่าน'),
  ('ปัญหาโปรแกรม', 'SAP', 'รหัสหมดอายุ'),
  ('ปัญหาโปรแกรม', 'SAP', 'อื่นๆ (โปรดระบุ)'),
  ('ปัญหาโปรแกรม', 'Express', 'ล็อกอินไม่ได้'),
  ('ปัญหาโปรแกรม', 'Express', 'ปริ้นไม่ออก'),
  ('ปัญหาโปรแกรม', 'Express', 'รหัสหมดอายุ'),
  ('ปัญหาโปรแกรม', 'Express', 'อื่นๆ (โปรดระบุ)'),
  ('ปัญหาโปรแกรม', 'Tigersoft', 'ระบุปัญหา'),
  ('ปัญหาโปรแกรม', 'VPN', 'ใช้งานไม่ได้'),
  ('ปัญหาโปรแกรม', 'VPN', 'ขอรหัสผ่าน'),
  ('ปัญหาโปรแกรม', 'VPN', 'อื่นๆ (โปรดระบุ)'),
  ('ปัญหาโปรแกรม', 'Microsoft Power Bi', 'เปิดโปรแกรมไม่ได้'),
  ('ปัญหาโปรแกรม', 'Microsoft Power Bi', 'ล็อกอิน License'),
  ('ปัญหาโปรแกรม', 'Microsoft Power Bi', 'อื่นๆ (โปรดระบุ)'),
  ('ปัญหาโปรแกรม', 'Adobe Creative Cloud', 'ล็อกอิน License'),
  ('ปัญหาโปรแกรม', 'Adobe Creative Cloud', 'อื่นๆ (โปรดระบุ)'),
  ('ปัญหาโปรแกรม', 'Adobe Acrobat Pro', 'ล็อกอิน License'),
  ('ปัญหาโปรแกรม', 'Adobe Acrobat Pro', 'อื่นๆ (โปรดระบุ)'),
  ('ปัญหาโปรแกรม', 'Adobe Illustrator', 'ล็อกอิน License'),
  ('ปัญหาโปรแกรม', 'Adobe Illustrator', 'อื่นๆ (โปรดระบุ)'),
  ('ปัญหาโปรแกรม', 'โปรแกรมอื่นๆ (โปรดระบุ)', 'โปรดระบุ'),
  ('ปัญหาเครือข่าย และอินเทอร์เน็ต', 'Driveshare (ไฟล์กลาง)', 'เข้าไฟล์กลางไม่ได้'),
  ('ปัญหาเครือข่าย และอินเทอร์เน็ต', 'Driveshare (ไฟล์กลาง)', 'ไดรฟ์ไฟล์กลางหาย'),
  ('ปัญหาเครือข่าย และอินเทอร์เน็ต', 'Driveshare (ไฟล์กลาง)', 'กู้ข้อมูล'),
  ('ปัญหาเครือข่าย และอินเทอร์เน็ต', 'Driveshare (ไฟล์กลาง)', 'อื่นๆ (โปรดระบุ)'),
  ('ปัญหาเครือข่าย และอินเทอร์เน็ต', 'อินเทอร์เน็ต', 'เข้าเว็บไซต์ไม่ได้'),
  ('ปัญหาเครือข่าย และอินเทอร์เน็ต', 'อินเทอร์เน็ต', 'อื่นๆ (โปรดระบุ)'),
  ('ขอสิทธิ์เข้าระบบ (ทำใบขอสิทธิ์)', 'พนักงานใหม่', 'เซ็ทอัพคอมพิวเตอร์'),
  ('ขอสิทธิ์เข้าระบบ (ทำใบขอสิทธิ์)', 'พนักงานใหม่', 'อื่นๆ (โปรดระบุ)'),
  ('ขอสิทธิ์เข้าระบบ (ทำใบขอสิทธิ์)', 'ขอสิทธิ์เข้าระบบ SAP', ''),
  ('ขอสิทธิ์เข้าระบบ (ทำใบขอสิทธิ์)', 'ขอสิทธิ์เข้าระบบ Express', ''),
  ('ขอสิทธิ์เข้าระบบ (ทำใบขอสิทธิ์)', 'เปลี่ยนแปลงสิทธิ์ (Driveshare)', 'ขอเพิ่มสิทธิ์ไฟล์กลาง'),
  ('ขอสิทธิ์เข้าระบบ (ทำใบขอสิทธิ์)', 'เปลี่ยนแปลงสิทธิ์ (Driveshare)', 'ขอลบสิทธิ์ไฟล์กลาง'),
  ('ขอสิทธิ์เข้าระบบ (ทำใบขอสิทธิ์)', 'เปลี่ยนแปลงสิทธิ์ (Driveshare)', 'อื่นๆ (โปรดระบุ)'),
  ('ขอสิทธิ์เข้าระบบ (ทำใบขอสิทธิ์)', 'เปลี่ยนแปลงสิทธิ์ (ปริ้นเตอร์)', 'ขอเพิ่มสิทธิ์ปริ้นเตอร์ (สี)'),
  ('ขอสิทธิ์เข้าระบบ (ทำใบขอสิทธิ์)', 'เปลี่ยนแปลงสิทธิ์ (ปริ้นเตอร์)', 'ขอเพิ่มสิทธิ์ปริ้นเตอร์ (ขาว-ดำ)'),
  ('ขอสิทธิ์เข้าระบบ (ทำใบขอสิทธิ์)', 'เปลี่ยนแปลงสิทธิ์ (ปริ้นเตอร์)', 'อื่นๆ (โปรดระบุ)'),
  ('ขอสิทธิ์เข้าระบบ (ทำใบขอสิทธิ์)', 'เปลี่ยนแปลงสิทธิ์ (Email)', 'ขอเพิ่มอีเมล'),
  ('ขอสิทธิ์เข้าระบบ (ทำใบขอสิทธิ์)', 'เปลี่ยนแปลงสิทธิ์ (Email)', 'อื่นๆ (โปรดระบุ)'),
  ('ขอสิทธิ์เข้าระบบ (ทำใบขอสิทธิ์)', 'ขอใช้งาน VPN', ''),
  ('ขอสิทธิ์เข้าระบบ (ทำใบขอสิทธิ์)', 'เปลี่ยนแปลงสิทธิ์ (คอมพิวเตอร์)', 'ขอเปลี่ยนคอมพิวเตอร์'),
  ('ขอสิทธิ์เข้าระบบ (ทำใบขอสิทธิ์)', 'เปลี่ยนแปลงสิทธิ์ (คอมพิวเตอร์)', 'ขอยืมคอมพิวเตอร์'),
  ('ขอสิทธิ์เข้าระบบ (ทำใบขอสิทธิ์)', 'เปลี่ยนแปลงสิทธิ์ (คอมพิวเตอร์)', 'อื่นๆ (โปรดระบุ)'),
  ('ขอสิทธิ์เข้าระบบ (ทำใบขอสิทธิ์)', 'ขอใช้งานโปรแกรมอื่นๆ', '')
)
update worklist w
   set needs_permission = true
  from _seed s
 where coalesce(w.job_type,'')   = s.job_type
   and coalesce(w.issue_type,'') = s.issue_type
   and coalesce(w.symptom,'')    = s.symptom;

-- ===== 3. Backfill existing tickets from current worklist state =====
update tickets t
   set permission_required = true,
       permission_status   = case when t.permission_status = 'not_required'
                                  then 'pending'
                                  else t.permission_status end
  from worklist w
 where coalesce(t.job_type,'')   = coalesce(w.job_type,'')
   and coalesce(t.issue_type,'') = coalesce(w.issue_type,'')
   and coalesce(t.symptom,'')    = coalesce(w.symptom,'')
   and w.needs_permission = true
   and (t.permission_required is null or t.permission_required = false);

-- ===== 4. create_ticket — auto-detect from worklist on insert =====

create or replace function create_ticket(payload json)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  prefix         text;
  max_seq        int;
  new_seq        int;
  new_ticket_no  text;
  needs_perm     boolean;
  init_status    text;
begin
  prefix := 'IT' || to_char(now(), 'YYMM');

  select coalesce(
           max(substring(ticket_no from length(prefix) + 1)::int),
           0)
    into max_seq
    from tickets
   where ticket_no like prefix || '%'
     and substring(ticket_no from length(prefix) + 1) ~ '^[0-9]+$';

  new_seq := max_seq + 1;
  new_ticket_no := prefix || lpad(new_seq::text, 4, '0');

  -- Look up worklist to decide whether this issue requires a permission slip
  select coalesce(needs_permission, false) into needs_perm
    from worklist
   where coalesce(job_type,'')   = coalesce(payload->>'jobType', '')
     and coalesce(issue_type,'') = coalesce(payload->>'issueType', '')
     and coalesce(symptom,'')    = coalesce(payload->>'symptom', '')
   limit 1;

  needs_perm := coalesce(needs_perm, false);
  init_status := case when needs_perm then 'pending' else 'not_required' end;

  insert into tickets (
    ticket_no, employee_id, employee_name, plant,
    job_type, issue_type, symptom, request,
    vnc_number, phone, location, status,
    permission_required, permission_status
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
    needs_perm,
    init_status
  );

  return json_build_object(
    'success', true,
    'ticketId', new_ticket_no,
    'permissionRequired', needs_perm
  );
end;
$$;

revoke all on function create_ticket(json) from public;
grant execute on function create_ticket(json) to anon, authenticated;

-- ===== 5. update_ticket — admin can attach / change permission slip =====
-- Wraps the existing v29 implementation and adds permission_* handling.

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
  is_adm           boolean;
  emp              employees%rowtype;
  tid              bigint;
  old_row          tickets%rowtype;
  new_status       text;
  new_admin        text;
  new_reply        text;
  new_priority     text;
  new_reply_photos text[];
  new_perm_status  text;
  new_perm_url     text;
  new_perm_no      text;
  admin_label      text;
  notif_msg        text;
  assigned_emp     employees%rowtype;
  reporter         employees%rowtype;
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

  -- Permission slip — only overwrite when caller actually included the field
  new_perm_status := coalesce(payload->>'permissionStatus', old_row.permission_status);
  new_perm_url    := coalesce(payload->>'permissionDocUrl', old_row.permission_doc_url);
  new_perm_no     := coalesce(payload->>'permissionDocNo',  old_row.permission_doc_no);

  -- Status Rules (unchanged from v29)
  if new_status = 'ยกเลิก' and old_row.status <> 'ยกเลิก' then
    return json_build_object('success', false, 'message', 'ไม่สามารถยกเลิก Ticket ได้ — ต้องให้ผู้แจ้งยกเลิกเอง');
  end if;
  if new_status = 'เปิด Ticket' and old_row.status not in ('เปิด Ticket') then
    return json_build_object('success', false, 'message', 'ไม่สามารถย้อนสถานะกลับเป็น "เปิด Ticket"');
  end if;
  if old_row.status = 'ปิดงานแล้ว' and new_status <> 'ปิดงานแล้ว' then
    return json_build_object('success', false, 'message', 'Ticket ปิดงานแล้ว แก้ไขไม่ได้');
  end if;

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

  -- History (status / admin / reply / priority / permission_status)
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
  if coalesce(old_row.permission_status,'') <> coalesce(new_perm_status,'') then
    insert into ticket_history(ticket_key, ticket_no, changed_by_id, changed_by_name, field, old_value, new_value)
    values (tid, old_row.ticket_no, emp.employee_id, admin_label, 'permission_status',
            old_row.permission_status, new_perm_status);
  end if;

  update tickets set
    status              = new_status,
    admin               = new_admin,
    reply               = new_reply,
    priority            = new_priority,
    reply_photo_urls    = new_reply_photos,
    permission_status   = new_perm_status,
    permission_doc_url  = new_perm_url,
    permission_doc_no   = new_perm_no
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
    if coalesce(old_row.permission_status,'') <> coalesce(new_perm_status,'')
       and new_perm_status in ('approved','rejected','submitted') then
      if notif_msg <> '' then notif_msg := notif_msg || ' / '; end if;
      notif_msg := notif_msg || 'ใบขอสิทธิ์: ' || new_perm_status;
    end if;

    if notif_msg <> '' then
      insert into notifications(employee_id, title, body, ticket_key, ticket_no)
      values (old_row.employee_id, 'อัปเดต ' || old_row.ticket_no, notif_msg, tid, old_row.ticket_no);
    end if;
  end if;

  -- Notify Sr.Mgr / Manager (unchanged from v29 — kept for completeness)
  if coalesce(old_row.status,'') <> coalesce(new_status,'') then
    if old_row.admin is not null and old_row.admin <> '' then
      select * into assigned_emp from employees
       where trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) = old_row.admin
       limit 1;
    end if;
    insert into notifications(employee_id, title, body, ticket_key, ticket_no)
    select e.employee_id,
           'สถานะเปลี่ยน ' || old_row.ticket_no,
           'สถานะเปลี่ยนเป็น "' || new_status || '"' ||
             coalesce(' โดย ' || admin_label, ''),
           tid, old_row.ticket_no
      from employees e
     where coalesce(e.role,'user') in ('manager','senior_manager')
       and e.employee_id <> emp.employee_id;
  end if;

  return json_build_object('success', true);
end;
$body$;

revoke all on function update_ticket(text, text, json) from public;
grant execute on function update_ticket(text, text, json) to anon, authenticated;
