-- ============================================================
-- Phase 3: Admin assignee dropdown + plant filter support
-- Run this entire file in Supabase SQL Editor
-- (Safe to re-run)
-- ============================================================

-- ===== get_assignees() — list of IT staff (admins) =====
-- Returns only safe fields, no password.
-- Used by the admin edit modal to populate the "ผู้รับผิดชอบ" dropdown.

create or replace function get_assignees()
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  result json;
begin
  select json_agg(row_to_json(t) order by t.employee_id) into result
  from (
    select
      employee_id                                 as "employeeId",
      coalesce(first_name, '')                    as "firstName",
      coalesce(last_name, '')                     as "lastName",
      coalesce(nickname, '')                      as "nickname",
      coalesce(department, '')                    as "department"
    from employees
    where is_admin = true
    order by employee_id
  ) t;

  return coalesce(result, '[]'::json);
end;
$body$;

revoke all on function get_assignees() from public;
grant execute on function get_assignees() to anon, authenticated;
