-- Migration v20 · 2026-06-08
-- Add attendee tracking for meeting bookings. Phase 1 of the "meeting window"
-- feature: invitees can join, see who's coming, invite others.
--
-- Status flow:
--   invited  -> someone added them but they haven't acted
--   joined   -> they clicked "เข้าร่วม"
--   declined -> they explicitly said no
--
-- The booker themselves is auto-added with status='joined' so they always
-- appear in the attendee list.

create table if not exists public.mtg_attendees (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.mtg_bookings(id) on delete cascade,
  employee_id text not null,
  status      text not null default 'invited'
              check (status in ('invited', 'joined', 'declined')),
  invited_by  text,
  invited_at  timestamptz default now(),
  joined_at   timestamptz,
  unique (booking_id, employee_id)
);

create index if not exists mtg_attendees_booking_idx  on public.mtg_attendees (booking_id);
create index if not exists mtg_attendees_employee_idx on public.mtg_attendees (employee_id);

alter table public.mtg_attendees enable row level security;

-- Permissive read/write — actual checks happen inside the RPC functions
drop policy if exists mtg_attendees_all on public.mtg_attendees;
create policy mtg_attendees_all on public.mtg_attendees for all to anon, authenticated using (true) with check (true);


-- ============================================================================
-- RPC: mtg_list_attendees — return everyone for a booking with their employee info
create or replace function public.mtg_list_attendees(p_booking_id uuid)
returns table (
  employee_id  text,
  first_name   text,
  last_name    text,
  nickname     text,
  department   text,
  "position"   text,
  status       text,
  invited_by   text,
  invited_at   timestamptz,
  joined_at    timestamptz
)
language sql
security definer
set search_path = public
as $body$
  select
    a.employee_id,
    e.first_name,
    e.last_name,
    e.nickname,
    e.department,
    e.position,
    a.status,
    a.invited_by,
    a.invited_at,
    a.joined_at
  from mtg_attendees a
  left join employees e on e.employee_id = a.employee_id
  where a.booking_id = p_booking_id
  order by
    case a.status when 'joined' then 1 when 'invited' then 2 else 3 end,
    a.invited_at;
$body$;

revoke all on function public.mtg_list_attendees(uuid) from public;
grant execute on function public.mtg_list_attendees(uuid) to anon, authenticated;


-- ============================================================================
-- RPC: mtg_invite_attendees — booker (or already-joined attendee) adds new invitees
create or replace function public.mtg_invite_attendees(
  p_booking_id uuid,
  p_inviter_id text,
  p_invitee_ids text[]
)
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_booker text;
  v_added   int := 0;
  v_skipped int := 0;
  v_eid     text;
  v_valid   boolean;
begin
  select booker into v_booker from mtg_bookings where id = p_booking_id;
  if v_booker is null then
    raise exception 'booking not found';
  end if;

  -- Inviter must be the booker OR already joined
  if not exists (
    select 1 from employees
     where employee_id = p_inviter_id
       and (first_name || ' ' || last_name) = v_booker
  ) and not exists (
    select 1 from mtg_attendees
     where booking_id = p_booking_id
       and employee_id = p_inviter_id
       and status = 'joined'
  ) then
    raise exception 'only the booker or a joined attendee can invite others';
  end if;

  foreach v_eid in array p_invitee_ids loop
    v_eid := trim(v_eid);
    if v_eid is null or v_eid = '' then continue; end if;
    select exists(select 1 from employees where employee_id = v_eid) into v_valid;
    if not v_valid then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into mtg_attendees (booking_id, employee_id, status, invited_by)
    values (p_booking_id, v_eid, 'invited', p_inviter_id)
    on conflict (booking_id, employee_id) do nothing;
    if found then v_added := v_added + 1; else v_skipped := v_skipped + 1; end if;
  end loop;

  return json_build_object('added', v_added, 'skipped', v_skipped);
end;
$body$;

revoke all on function public.mtg_invite_attendees(uuid, text, text[]) from public;
grant execute on function public.mtg_invite_attendees(uuid, text, text[]) to anon, authenticated;


-- ============================================================================
-- RPC: mtg_set_attendance — invitee accepts or declines
create or replace function public.mtg_set_attendance(
  p_booking_id uuid,
  p_employee_id text,
  p_status      text     -- 'joined' or 'declined'
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
begin
  if p_status not in ('joined', 'declined') then
    raise exception 'status must be joined or declined';
  end if;

  -- Only people who were actually invited can change their own status
  if not exists (
    select 1 from mtg_attendees
     where booking_id = p_booking_id
       and employee_id = p_employee_id
  ) then
    raise exception 'you were not invited to this meeting';
  end if;

  update mtg_attendees
     set status    = p_status,
         joined_at = case when p_status = 'joined' then now() else joined_at end
   where booking_id = p_booking_id
     and employee_id = p_employee_id;
end;
$body$;

revoke all on function public.mtg_set_attendance(uuid, text, text) from public;
grant execute on function public.mtg_set_attendance(uuid, text, text) to anon, authenticated;


-- ============================================================================
-- RPC: mtg_my_invites — list bookings the user is invited to (for a notification bell, future)
create or replace function public.mtg_my_invites(p_employee_id text)
returns table (
  booking_id   uuid,
  room_id      text,
  booking_date date,
  start_min    int,
  end_min      int,
  title        text,
  booker       text,
  status       text
)
language sql
security definer
set search_path = public
as $body$
  select
    b.id,
    b.room_id,
    b.booking_date,
    b.start_min,
    b.end_min,
    b.title,
    b.booker,
    a.status
  from mtg_attendees a
  join mtg_bookings  b on b.id = a.booking_id
  where a.employee_id = p_employee_id
    and b.booking_date >= current_date
  order by b.booking_date, b.start_min;
$body$;

revoke all on function public.mtg_my_invites(text) from public;
grant execute on function public.mtg_my_invites(text) to anon, authenticated;
