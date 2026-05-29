-- ============================================================
-- Phase 17: Auto-close stale tickets (7 days after "ดำเนินการเรียบร้อย")
-- ============================================================

-- Add resolved_at column to track when IT finished work
alter table tickets add column if not exists resolved_at timestamptz;

-- Trigger: set/clear resolved_at when status transitions
create or replace function trg_set_resolved_at()
returns trigger language plpgsql as $body$
begin
  if TG_OP = 'INSERT' then
    if NEW.status = 'ดำเนินการเรียบร้อย' then
      NEW.resolved_at := now();
    end if;
  elsif TG_OP = 'UPDATE' then
    if NEW.status = 'ดำเนินการเรียบร้อย'
       and OLD.status is distinct from 'ดำเนินการเรียบร้อย' then
      NEW.resolved_at := now();
    elsif NEW.status is distinct from 'ดำเนินการเรียบร้อย'
          and OLD.status = 'ดำเนินการเรียบร้อย' then
      NEW.resolved_at := null;
    end if;
  end if;
  return NEW;
end;
$body$;

drop trigger if exists ticket_set_resolved_at on tickets;
create trigger ticket_set_resolved_at
before insert or update on tickets
for each row execute function trg_set_resolved_at();

-- Backfill: existing "ดำเนินการเรียบร้อย" tickets get 7 more days from now
-- (so users who are mid-transition won't suddenly lose tickets)
update tickets
set resolved_at = now()
where status = 'ดำเนินการเรียบร้อย' and resolved_at is null;

-- ============================================================
-- Auto-close function: closes tickets resolved >7 days ago
-- ============================================================
create or replace function auto_close_stale_tickets()
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  closed_count int := 0;
  ticket_rec   tickets%rowtype;
begin
  for ticket_rec in
    select * from tickets
    where status = 'ดำเนินการเรียบร้อย'
      and resolved_at is not null
      and resolved_at < now() - interval '7 days'
  loop
    update tickets
    set status = 'ปิดงานแล้ว'
    where key = ticket_rec.key;

    insert into ticket_history (
      ticket_key, ticket_no, changed_by_id, changed_by_name,
      field, old_value, new_value
    ) values (
      ticket_rec.key, ticket_rec.ticket_no, 'SYSTEM', 'ระบบปิดอัตโนมัติ',
      'status', 'ดำเนินการเรียบร้อย', 'ปิดงานแล้ว (auto-close หลัง 7 วัน)'
    );

    -- Notify the user
    if ticket_rec.employee_id is not null and ticket_rec.employee_id <> '' then
      insert into notifications (employee_id, ticket_no, title, message)
      values (
        ticket_rec.employee_id,
        ticket_rec.ticket_no,
        'Ticket ' || ticket_rec.ticket_no || ' ปิดอัตโนมัติ',
        'ปิดอัตโนมัติเนื่องจากไม่มีการยืนยันภายใน 7 วัน · หากปัญหายังอยู่สามารถเปิดใหม่ได้'
      );
    end if;

    closed_count := closed_count + 1;
  end loop;

  return json_build_object('success', true, 'closed_count', closed_count);
end;
$body$;

grant execute on function auto_close_stale_tickets() to anon, authenticated;

-- ============================================================
-- Schedule: run daily at 02:00 Asia/Bangkok (= 19:00 UTC previous day)
-- NOTE: pg_cron must be enabled first. In Supabase Dashboard:
--   Database > Extensions > search "pg_cron" > Enable
-- Or via SQL (requires superuser):
--   create extension if not exists pg_cron with schema extensions;
-- ============================================================

-- Remove old schedule if re-running
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('auto-close-stale-tickets-daily')
    where exists (select 1 from cron.job where jobname = 'auto-close-stale-tickets-daily');

    perform cron.schedule(
      'auto-close-stale-tickets-daily',
      '0 19 * * *',   -- 19:00 UTC = 02:00 Bangkok
      $job$select auto_close_stale_tickets();$job$
    );
  else
    raise notice 'pg_cron not enabled — schedule skipped. Enable via Dashboard > Extensions > pg_cron, then rerun this block.';
  end if;
end $$;
