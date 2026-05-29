-- ============================================================
-- Phase 24: Auto-approve new registrations
--   สมัครแล้วใช้งานได้ทันที — ไม่ต้องรออนุมัติ
-- ============================================================

-- ========== 1) Auto-approve user เก่าที่ค้างรออนุมัติอยู่ ==========
update employees
   set is_approved = true
 where is_approved = false;

-- ========== 2) Update register_employee: is_approved=true ==========
drop function if exists register_employee(text,text,text,text,text,text,text,text,text);

create or replace function register_employee(
  p_emp_id     text,
  p_password   text,
  p_company    text,
  p_first_name text,
  p_last_name  text,
  p_nickname   text,
  p_position   text,
  p_email      text,
  p_phone      text
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  existing employees%rowtype;
begin
  select * into existing from employees where employee_id = p_emp_id;
  if found then
    return json_build_object('success', false, 'message', 'รหัสพนักงานนี้มีอยู่ในระบบแล้ว');
  end if;

  insert into employees (
    employee_id, password, company, first_name, last_name,
    nickname, position, email, phone,
    role, scope_company, is_admin, is_approved, registered_at
  ) values (
    p_emp_id, p_password, p_company, p_first_name, p_last_name,
    p_nickname, p_position, p_email, p_phone,
    'user', null, false, true, now()  -- ← auto-approve
  );

  -- แจ้ง Manager + Senior Manager ว่ามีพนักงานใหม่ (FYI only)
  insert into notifications (employee_id, ticket_no, title, message)
  select employee_id, '',
         'มีพนักงานใหม่เข้าระบบ',
         p_emp_id || ' — ' ||
         coalesce(p_first_name,'') || ' ' || coalesce(p_last_name,'') ||
         ' (' || coalesce(p_company,'') || ')'
    from employees
   where role in ('manager','senior_manager');

  return json_build_object(
    'success', true,
    'message', 'ลงทะเบียนสำเร็จ เข้าใช้งานได้ทันที'
  );
end;
$body$;

grant execute on function register_employee(text,text,text,text,text,text,text,text,text) to anon, authenticated;

-- ============================================================
-- หลังรัน:
--   select employee_id, first_name, is_approved from employees where is_approved=false;
--   → ควรคืน 0 rows (ไม่มีใครค้างแล้ว)
-- ============================================================
