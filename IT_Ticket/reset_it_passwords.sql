-- ============================================================
-- Reset IT team passwords + unblock accounts
-- ============================================================

-- 1) ล้าง resigned_date + เปิดใช้งาน + reset password
update employees
   set resigned_date = null,
       is_approved   = true,
       is_admin      = true,
       password      = case employee_id
         when '10375' then 'Bird@2025'      -- เบิร์ด (Manager)
         when '31058' then 'Vee@2025'       -- วี (Sr.Mgr ICT)
         when '11329' then 'Puk@2025'       -- ปุ๊ก (Officer Comets)
         else password
       end
 where employee_id in ('10375','31058','11329');

-- 2) ตรวจผลลัพธ์
select employee_id, nickname, role, scope_company, password, is_approved, resigned_date
  from employees
 where employee_id in ('10375','31058','11329');
