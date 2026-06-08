-- Migration v27 · 2026-06-08
-- Auto-register the booker as a joined attendee. Solves the gap where the
-- booker had no row in mtg_attendees (they were the implicit organizer),
-- which made isJoined=false on the popout window and hid every interactive
-- section. Now anyone who is the booker AND opens the meeting window gets
-- a row created lazily — no UI sections disappear from the booker's view.

create or replace function public.mtg_ensure_booker_joined(
  p_booking_id  uuid,
  p_employee_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_booker    text;
  v_full_name text;
begin
  select booker into v_booker from mtg_bookings where id = p_booking_id;
  if v_booker is null then raise exception 'booking not found'; end if;

  select first_name || ' ' || last_name into v_full_name
    from employees where employee_id = p_employee_id;
  -- Only the actual booker (name match) can self-register via this RPC.
  if v_full_name is null
     or regexp_replace(v_full_name, '\s+', ' ', 'g') <> regexp_replace(v_booker, '\s+', ' ', 'g') then
    return;  -- silently no-op for non-bookers
  end if;

  insert into mtg_attendees (booking_id, employee_id, status, invited_by, joined_at)
  values (p_booking_id, p_employee_id, 'joined', p_employee_id, now())
  on conflict (booking_id, employee_id) do nothing;
end;
$body$;

revoke all on function public.mtg_ensure_booker_joined(uuid, text) from public;
grant execute on function public.mtg_ensure_booker_joined(uuid, text) to anon, authenticated;
