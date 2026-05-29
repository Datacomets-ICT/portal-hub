-- ============================================================
-- Merge รหัสซ้ำ: IT03 → 31058 (วี), IT07 → 11329 (ปุ๊ก)
-- ============================================================
-- ทำงานใน transaction เพื่อป้องกันข้อมูลเสีย
begin;

-- 1) ตรวจ ว่าเป็นคนเดียวกันจริง (รัน-อ่าน-ตัดสินใจ)
select employee_id, first_name, last_name, nickname, department, position, email
  from employees
 where employee_id in ('IT03','IT07','31058','11329')
 order by employee_id;

-- ============================================================
-- Migrate ข้อมูลจาก IT03 → 31058
-- ============================================================

-- tickets: ย้าย ticket ที่ผู้แจ้งเป็น IT03 ไป 31058
update tickets set employee_id = '31058' where employee_id = 'IT03';

-- tickets: แก้ admin text ให้เป็น "วี" ล้วน ๆ (ให้ filter officer/senior matching ได้)
update tickets set admin = 'วี' where admin in ('IT03_วี','IT03','IT03 วี');

-- notifications
update notifications set employee_id = '31058' where employee_id = 'IT03';

-- ticket_messages (คนส่ง)
update ticket_messages set sender_id = '31058' where sender_id = 'IT03';

-- ticket_message_reads
delete from ticket_message_reads
 where employee_id = 'IT03'
   and ticket_key in (select ticket_key from ticket_message_reads where employee_id = '31058');
update ticket_message_reads set employee_id = '31058' where employee_id = 'IT03';

-- ticket_history
update ticket_history set changed_by_id = '31058' where changed_by_id = 'IT03';

-- chat_logs
update chat_logs set employee_id = '31058' where employee_id = 'IT03';

-- ============================================================
-- Migrate ข้อมูลจาก IT07 → 11329
-- ============================================================
update tickets            set employee_id = '11329' where employee_id = 'IT07';
update tickets            set admin = 'ปุ๊ก' where admin in ('IT07_ปุ๊ก','IT07','IT07 ปุ๊ก');
update notifications      set employee_id = '11329' where employee_id = 'IT07';
update ticket_messages    set sender_id   = '11329' where sender_id   = 'IT07';
delete from ticket_message_reads
 where employee_id = 'IT07'
   and ticket_key in (select ticket_key from ticket_message_reads where employee_id = '11329');
update ticket_message_reads set employee_id = '11329' where employee_id = 'IT07';
update ticket_history      set changed_by_id = '11329' where changed_by_id = 'IT07';
update chat_logs           set employee_id   = '11329' where employee_id   = 'IT07';

-- ============================================================
-- ลบ account ซ้ำ
-- ============================================================
delete from employees where employee_id in ('IT03','IT07');

-- ============================================================
-- ตรวจผล — ไม่ควรมี nickname ซ้ำแล้ว
-- ============================================================
select nickname, count(*) as จำนวน, array_agg(employee_id) as รหัส
  from employees
 where nickname is not null and nickname <> ''
 group by nickname
having count(*) > 1;

-- ถ้าไม่มีผล → ไม่มีซ้ำแล้ว
-- ถ้าเห็นคำว่า "ยังมีซ้ำ" → rollback;

commit;
