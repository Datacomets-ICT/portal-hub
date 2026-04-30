-- ============================================================
-- Phase 38: Lock down direct anon access to `tickets`
--
-- The base schema.sql + early migrations created two permissive
-- policies on tickets:
--   tickets_read    — anyone with anon key could SELECT every ticket
--   tickets_insert  — anyone could INSERT a row directly
--
-- v18 already dropped them once, but this re-applies the drop
-- (idempotent) in case anything was re-created later.
--
-- Why it's safe:
--   - Frontend never touches `sb.from('tickets').select/insert/update`
--     directly — every read/write goes through one of the
--     SECURITY DEFINER RPCs:
--         create_ticket / update_ticket / get_tickets_paginated /
--         cancel_my_ticket / confirm_ticket_closed / etc.
--   - SECURITY DEFINER bypasses RLS, so closing the policies has
--     ZERO effect on the working code paths.
--   - `ticket_messages` is intentionally LEFT OPEN here — it's used
--     by the realtime channel for the unread-badge feature; closing
--     it would silently break that.
--
-- Verify after running:
--   select policyname, cmd, roles, qual from pg_policies
--    where schemaname='public' and tablename='tickets';
--   -- → should return 0 rows (no anon policies = no anon access)
-- ============================================================

drop policy if exists "tickets_read"   on tickets;
drop policy if exists "tickets_insert" on tickets;
drop policy if exists "tickets_update" on tickets;
drop policy if exists "tickets_delete" on tickets;

-- Make sure RLS itself is still ON (without policies + RLS on = denied)
alter table tickets enable row level security;
