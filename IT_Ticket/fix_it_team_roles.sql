-- ============================================================
-- Fix IT team: ปลดบล็อค + set role ที่ขาด
-- ============================================================

-- 1) ปลด resigned_date ให้เบิร์ด + ปุ๊ก (จะได้ login ได้)
update employees
   set resigned_date = null
 where employee_id in ('10375', '11329');

-- 2) Set role ให้ แชมป์ (IT08) = Senior Manager Comets
update employees
   set role          = 'senior_manager',
       scope_company = 'Comets',
       is_admin      = true,
       is_approved   = true,
       resigned_date = null
 where employee_id = 'IT08';

-- 3) Set role ให้ ยาม้าล (IT09) = Officer Comets
update employees
   set role          = 'officer',
       scope_company = 'Comets',
       is_admin      = true,
       is_approved   = true,
       resigned_date = null
 where employee_id = 'IT09';

-- 4) ตรวจผล
select employee_id, nickname, role, scope_company, password, is_admin, resigned_date
  from employees
 where employee_id in ('10375','31058','11329','IT08','IT09')
 order by
   case role
     when 'manager' then 1
     when 'senior_manager' then 2
     when 'officer' then 3
   end;
