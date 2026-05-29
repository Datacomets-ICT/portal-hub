-- ============================================================
-- Phase 30: get_tickets_brief — return reporter's avatar + nickname + position
-- ============================================================

create or replace function get_tickets_brief(p_emp_id text, p_password text, p_keys bigint[])
returns json language plpgsql security definer set search_path = public
as $body$
declare
  emp employees%rowtype;
  is_adm boolean;
begin
  select * into emp from employees where employee_id = p_emp_id and password = p_password;
  if not found then return '[]'::json; end if;
  is_adm := coalesce(emp.is_admin, false)
         or coalesce(emp.role, 'user') in ('manager','senior_manager','officer');
  return coalesce((
    select json_agg(row_to_json(x))
    from (
      select t.key,
             t.ticket_no,
             t.employee_name,
             t.status,
             t.admin,
             coalesce(re.nickname, '')    as reporter_nickname,
             coalesce(re.position, '')    as reporter_position,
             coalesce(re.avatar_url, '')  as reporter_avatar
      from tickets t
      left join employees re on re.employee_id = t.employee_id
      where t.key = any(p_keys)
        and (is_adm or t.employee_id = p_emp_id)
    ) x
  ), '[]'::json);
end;
$body$;
grant execute on function get_tickets_brief(text, text, bigint[]) to anon, authenticated;
