-- Migration v21 · 2026-06-08
-- Phase 2 of meeting-window: chat messages between attendees.
-- Only joined attendees (or the booker) can post and read.

create table if not exists public.mtg_messages (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.mtg_bookings(id) on delete cascade,
  employee_id text not null,
  body        text not null check (length(body) between 1 and 4000),
  created_at  timestamptz default now()
);

create index if not exists mtg_messages_booking_created_idx
  on public.mtg_messages (booking_id, created_at);

alter table public.mtg_messages enable row level security;

-- Permissive policy — gating happens in the RPCs
drop policy if exists mtg_messages_all on public.mtg_messages;
create policy mtg_messages_all on public.mtg_messages for all to anon, authenticated using (true) with check (true);

-- Add to the realtime publication so subscribers get live INSERTs
do $body$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  alter publication supabase_realtime add table public.mtg_messages;
exception
  when duplicate_object then null;  -- table already in publication
end $body$;


-- ============================================================================
-- RPC: mtg_post_message — only the booker or joined attendees can post
create or replace function public.mtg_post_message(
  p_booking_id  uuid,
  p_employee_id text,
  p_body        text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_id        uuid;
  v_booker    text;
  v_full_name text;
begin
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'message body required';
  end if;
  if length(p_body) > 4000 then
    raise exception 'message too long';
  end if;

  select booker into v_booker from mtg_bookings where id = p_booking_id;
  if v_booker is null then
    raise exception 'booking not found';
  end if;

  select (first_name || ' ' || last_name) into v_full_name
    from employees where employee_id = p_employee_id;

  -- Allow if user is the booker OR has status='joined' in attendees
  if v_full_name <> v_booker
     and not exists (
       select 1 from mtg_attendees
        where booking_id = p_booking_id
          and employee_id = p_employee_id
          and status = 'joined'
     ) then
    raise exception 'you must join the meeting before posting';
  end if;

  insert into mtg_messages (booking_id, employee_id, body)
  values (p_booking_id, p_employee_id, trim(p_body))
  returning id into v_id;

  return v_id;
end;
$body$;

revoke all on function public.mtg_post_message(uuid, text, text) from public;
grant execute on function public.mtg_post_message(uuid, text, text) to anon, authenticated;


-- ============================================================================
-- RPC: mtg_list_messages — pull messages for a booking with sender info
create or replace function public.mtg_list_messages(p_booking_id uuid)
returns table (
  id           uuid,
  employee_id  text,
  first_name   text,
  last_name    text,
  nickname     text,
  body         text,
  created_at   timestamptz
)
language sql
security definer
set search_path = public
as $body$
  select
    m.id,
    m.employee_id,
    e.first_name,
    e.last_name,
    e.nickname,
    m.body,
    m.created_at
  from mtg_messages m
  left join employees e on e.employee_id = m.employee_id
  where m.booking_id = p_booking_id
  order by m.created_at asc;
$body$;

revoke all on function public.mtg_list_messages(uuid) from public;
grant execute on function public.mtg_list_messages(uuid) to anon, authenticated;
