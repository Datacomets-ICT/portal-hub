-- ============================================================
-- Phase 20: Quick contact popup for chat list
-- ============================================================

-- Fetch email/phone of the ticket owner + assigned admin
-- Authorized: ticket owner or any admin
-- Admin field format is "{employee_id}_{nickname}" — split to find the admin record
create or replace function get_ticket_contacts(
  p_emp_id     text,
  p_password   text,
  p_ticket_key bigint
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  caller    employees%rowtype;
  is_adm    boolean;
  t         tickets%rowtype;
  owner_emp employees%rowtype;
  admin_emp employees%rowtype;
  admin_id  text;
begin
  select * into caller from employees
  where employee_id = p_emp_id and password = p_password;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์');
  end if;
  is_adm := coalesce(caller.is_admin, false);

  select * into t from tickets where key = p_ticket_key;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่พบ ticket');
  end if;

  if not is_adm and t.employee_id <> p_emp_id then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์ดูข้อมูลติดต่อ');
  end if;

  select * into owner_emp from employees where employee_id = t.employee_id;

  if t.admin is not null and t.admin <> '' then
    admin_id := split_part(t.admin, '_', 1);
    select * into admin_emp from employees where employee_id = admin_id;
  end if;

  return json_build_object(
    'success', true,
    'owner', case when owner_emp.employee_id is not null then
      json_build_object(
        'employeeId', owner_emp.employee_id,
        'firstName',  coalesce(owner_emp.first_name, ''),
        'lastName',   coalesce(owner_emp.last_name, ''),
        'nickname',   coalesce(owner_emp.nickname, ''),
        'department', coalesce(owner_emp.department, ''),
        'section',    coalesce(owner_emp.section, ''),
        'position',   coalesce(owner_emp.position, ''),
        'email',      coalesce(owner_emp.email, ''),
        'phone',      coalesce(owner_emp.phone, ''),
        'avatarUrl',  coalesce(owner_emp.avatar_url, '')
      )
    else null end,
    'admin', case when admin_emp.employee_id is not null then
      json_build_object(
        'employeeId', admin_emp.employee_id,
        'firstName',  coalesce(admin_emp.first_name, ''),
        'lastName',   coalesce(admin_emp.last_name, ''),
        'nickname',   coalesce(admin_emp.nickname, ''),
        'department', coalesce(admin_emp.department, ''),
        'section',    coalesce(admin_emp.section, ''),
        'position',   coalesce(admin_emp.position, ''),
        'email',      coalesce(admin_emp.email, ''),
        'phone',      coalesce(admin_emp.phone, ''),
        'avatarUrl',  coalesce(admin_emp.avatar_url, '')
      )
    else null end
  );
end;
$body$;

revoke all on function get_ticket_contacts(text, text, bigint) from public;
grant execute on function get_ticket_contacts(text, text, bigint) to anon, authenticated;
