-- ============================================================
-- Employees cleanup — dedup + soft/hard delete non-Excel rows
-- ============================================================
-- Strategy:
--   1. Backup full table to employees_backup_YYYYMMDD (so we can restore)
--   2. Dedup: when name has multiple rows, keep the BEST one (in_directory
--      first, then row with tickets, then oldest employee_id); demote
--      others to in_directory=false
--   3. Soft delete: rows not in Excel that HAVE referenced data (tickets,
--      messages, notifications, bookings) → set is_approved=false +
--      resigned_date=today → can't login, hidden, but history preserved
--   4. Hard delete: rows not in Excel with ZERO references anywhere →
--      DELETE the row physically
--
-- Wrapped in transaction. If counts look wrong at the end, ROLLBACK.
-- ============================================================

begin;

-- ===== 0. Backup =====
drop table if exists employees_backup_20260526;
create table employees_backup_20260526 as
  select * from employees;

-- ===== Counts BEFORE =====
select 'BEFORE' as stage,
  count(*)                                                       as total,
  count(*) filter (where coalesce(in_directory, false) = true)   as in_excel,
  count(*) filter (where coalesce(in_directory, false) = false)  as not_in_excel,
  count(*) filter (where coalesce(is_approved, true)  = false)   as already_unapproved
from employees;

-- ===== 1. Dedup =====
-- If multiple rows share (first_name, last_name), only one stays as
-- in_directory=true. Ranking: prefer rows currently in_directory, then
-- rows with tickets, then oldest employee_id.
with ranked as (
  select e.employee_id,
    row_number() over (
      partition by e.first_name, e.last_name
      order by
        case when coalesce(e.in_directory, false) then 0 else 1 end,
        case when exists (select 1 from tickets t where t.employee_id = e.employee_id) then 0 else 1 end,
        e.employee_id
    ) as rn
  from employees e
  where coalesce(e.in_directory, false) = true
    and e.first_name is not null and e.first_name <> ''
)
update employees
   set in_directory = false
 where employee_id in (select employee_id from ranked where rn > 1);

-- ===== 2. Soft delete: not in Excel + has references =====
update employees
   set is_approved = false,
       resigned_date = coalesce(resigned_date, current_date)
 where coalesce(in_directory, false) = false
   and (
     exists (select 1 from tickets         t where t.employee_id = employees.employee_id)
     or exists (select 1 from ticket_messages m where m.sender_id   = employees.employee_id)
     or exists (select 1 from notifications   x where x.employee_id = employees.employee_id)
     or exists (select 1 from drv_bookings    b where b.employee_id = employees.employee_id)
   );

-- ===== 3. Hard delete: not in Excel + zero references =====
delete from employees
 where coalesce(in_directory, false) = false
   and not exists (select 1 from tickets         t where t.employee_id = employees.employee_id)
   and not exists (select 1 from ticket_messages m where m.sender_id   = employees.employee_id)
   and not exists (select 1 from notifications   x where x.employee_id = employees.employee_id)
   and not exists (select 1 from drv_bookings    b where b.employee_id = employees.employee_id);

-- ===== Counts AFTER =====
select 'AFTER' as stage,
  count(*)                                                       as total,
  count(*) filter (where coalesce(in_directory, false) = true)   as in_excel,
  count(*) filter (where coalesce(in_directory, false) = false)  as soft_kept,
  count(*) filter (where coalesce(is_approved, true)  = false)   as soft_deleted,
  (select count(*) from employees_backup_20260526)               as backup_total
from employees;

-- ============================================================
-- !! REVIEW the BEFORE/AFTER counts above BEFORE running commit !!
-- ============================================================
-- Expected (approx):
--   BEFORE:  total=3296, in_excel=~269+dups, not_in_excel=~3000
--   AFTER:   total=~300-500 (depends on dedup + how many had refs)
--            in_excel=~269 (no more dups)
--            soft_kept=remaining rows with history
--            soft_deleted=same as soft_kept (all soft_kept are marked unapproved)
--            backup_total=3296 (untouched)
--
-- If numbers look RIGHT → run:   commit;
-- If numbers look WRONG → run:   rollback;
-- ============================================================

-- (DO NOT auto-commit — let user inspect first)
-- Uncomment the line below ONLY when satisfied with the counts:
-- commit;
