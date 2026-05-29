-- ============================================================
-- Create test accounts สำหรับทดสอบ role ทั้ง 4 ระดับ
-- รหัสผ่าน = 1234 ทุกคน
-- ============================================================

insert into employees (
  employee_id, password, company, first_name, last_name, nickname,
  department, section, position, email, phone,
  role, scope_company, is_admin, is_approved
) values
  ('IT01', '1234', 'Comets', 'เบิร์ด_test',  'IT', 'เบิร์ด',
   'IT', 'Manager', 'Manager',          '', '',
   'manager',        null,     true, true),

  ('IT02', '1234', 'ICT',    'วี_test',      'IT', 'วี',
   'IT', 'Sr.Mgr',  'Senior Manager',    '', '',
   'senior_manager', 'ICT',    true, true),

  ('IT03', '1234', 'Comets', 'แชมป์_test',   'IT', 'แชมป์',
   'IT', 'Sr.Mgr',  'Senior Manager',    '', '',
   'senior_manager', 'Comets', true, true),

  ('IT04', '1234', 'Comets', 'ปุ๊ก_test',    'IT', 'ปุ๊ก',
   'IT', 'Officer', 'IT Officer',        '', '',
   'officer',        'Comets', true, true),

  ('IT05', '1234', 'Comets', 'ยาม้าล_test',  'IT', 'ยาม้าล',
   'IT', 'Officer', 'IT Officer',        '', '',
   'officer',        'Comets', true, true)

on conflict (employee_id) do update set
  password      = excluded.password,
  role          = excluded.role,
  scope_company = excluded.scope_company,
  is_admin      = excluded.is_admin,
  is_approved   = excluded.is_approved,
  resigned_date = null;

-- ตรวจผล
select employee_id, nickname, role, scope_company, password, is_approved
  from employees
 where employee_id like 'IT0%'
 order by employee_id;
