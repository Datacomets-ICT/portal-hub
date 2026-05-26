-- ============================================================
-- Employees cleanup audit — read-only, run before any DELETE
-- ============================================================

-- 1. Overall breakdown
select
  count(*)                                                            as total_rows,
  count(*) filter (where coalesce(in_directory, false) = true)        as in_excel_directory,
  count(*) filter (where coalesce(in_directory, false) = false)       as not_in_excel,
  count(*) filter (where resigned_date is not null)                   as marked_resigned,
  count(*) filter (where coalesce(is_approved, true) = false)         as unapproved
from employees;

-- 2. Duplicates by (first_name + last_name) — keep oldest, drop newer copies
select
  first_name, last_name, count(*) as dup_count,
  array_agg(employee_id order by employee_id) as employee_ids,
  array_agg(coalesce(in_directory, false) order by employee_id) as in_dir_flags
from employees
where first_name is not null and first_name <> ''
group by first_name, last_name
having count(*) > 1
order by dup_count desc, first_name
limit 30;

-- 3. Among "not in Excel" — how many have actual data dependencies?
with not_in_excel as (
  select employee_id from employees where coalesce(in_directory, false) = false
)
select
  'tickets (as reporter via employee_id)' as ref_table,
  count(*)                                as affected_employees
from not_in_excel n
where exists (select 1 from tickets t where t.employee_id = n.employee_id)
union all
select 'ticket_messages (as sender)',
  count(*)
from not_in_excel n
where exists (select 1 from ticket_messages m where m.sender_id = n.employee_id)
union all
select 'notifications',
  count(*)
from not_in_excel n
where exists (select 1 from notifications x where x.employee_id = n.employee_id)
union all
select 'drv_bookings (as booker)',
  count(*)
from not_in_excel n
where exists (select 1 from drv_bookings b where b.employee_id = n.employee_id);

-- 4. Safe to hard-delete = no rows pointing to them anywhere
with not_in_excel as (
  select employee_id from employees where coalesce(in_directory, false) = false
)
select count(*) as safe_to_hard_delete
from not_in_excel n
where not exists (select 1 from tickets         t where t.employee_id = n.employee_id)
  and not exists (select 1 from ticket_messages m where m.sender_id   = n.employee_id)
  and not exists (select 1 from notifications   x where x.employee_id = n.employee_id)
  and not exists (select 1 from drv_bookings    b where b.employee_id = n.employee_id);

-- 5. Sample 20 of "not in Excel" — eyeball check, are these really ex-staff?
select
  employee_id, first_name, last_name, nickname, department, company,
  resigned_date,
  case when exists (select 1 from tickets t where t.employee_id = employees.employee_id) then 'yes' else 'no' end as has_tickets
from employees
where coalesce(in_directory, false) = false
order by employee_id
limit 20;
