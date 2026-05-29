-- ============================================================
-- Phase 6: Chat usage tracking (daily quota counter)
-- ============================================================

create table if not exists chat_usage (
  usage_date    date primary key default current_date,
  request_count int not null default 0
);

alter table chat_usage enable row level security;

drop policy if exists "usage_read" on chat_usage;
create policy "usage_read" on chat_usage
  for select to anon using (true);

-- RPC: increment counter and return current count
create or replace function increment_chat_usage()
returns int
language plpgsql
security definer
set search_path = public
as $body$
declare
  current_count int;
begin
  insert into chat_usage (usage_date, request_count)
  values (current_date, 1)
  on conflict (usage_date)
  do update set request_count = chat_usage.request_count + 1
  returning request_count into current_count;

  return current_count;
end;
$body$;

revoke all on function increment_chat_usage() from public;
grant execute on function increment_chat_usage() to anon, authenticated;

-- RPC: get today's count (without incrementing)
create or replace function get_chat_usage()
returns int
language plpgsql
security definer
set search_path = public
as $body$
declare
  current_count int;
begin
  select request_count into current_count
  from chat_usage
  where usage_date = current_date;

  return coalesce(current_count, 0);
end;
$body$;

revoke all on function get_chat_usage() from public;
grant execute on function get_chat_usage() to anon, authenticated;

-- RPC: force-set today's count (used when Gemini returns 429 to sync our counter)
create or replace function sync_chat_usage(p_count int)
returns void
language plpgsql
security definer
set search_path = public
as $body$
begin
  insert into chat_usage (usage_date, request_count)
  values (current_date, p_count)
  on conflict (usage_date)
  do update set request_count = p_count;
end;
$body$;

revoke all on function sync_chat_usage(int) from public;
grant execute on function sync_chat_usage(int) to anon, authenticated;
