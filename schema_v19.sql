-- ============================================================
-- Phase 19: Supabase Realtime for chat messages
-- ============================================================
-- Scope decision:
--   - chat messages  : REALTIME (instant UX; less sensitive than ticket metadata)
--   - ticket rows    : still behind RPC (30s polling stays)
--   - notifications  : 30s polling stays (low-frequency)
--
-- Trade-off: enabling Realtime requires RLS SELECT policy on the
-- subscribed table, which also re-opens direct REST SELECT on that
-- table. We accept this only for ticket_messages (chat text), not
-- for tickets themselves.
-- ============================================================

-- Add ticket_messages to the realtime publication (safe to re-run)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'ticket_messages'
  ) then
    execute 'alter publication supabase_realtime add table ticket_messages';
  end if;
end $$;

-- Narrow SELECT policy so Realtime can broadcast to subscribers
alter table ticket_messages enable row level security;
drop policy if exists "ticket_messages_realtime" on ticket_messages;
create policy "ticket_messages_realtime"
  on ticket_messages for select to anon using (true);

-- Note: Supabase Realtime will broadcast INSERT/UPDATE/DELETE events
-- The frontend subscribes with filter: ticket_key=eq.<specific_key>
-- so clients only receive events for the ticket they're viewing.
