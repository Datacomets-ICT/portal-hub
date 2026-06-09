-- Migration v29 · 2026-06-09
-- Booker-only kick: remove an attendee from a meeting. Deletes their row
-- in mtg_attendees outright (not "declined") so it's a hard remove —
-- they can be re-invited later if needed.

create or replace function public.mtg_remove_attendee(
  p_booking_id  uuid,
  p_target_id   text,
  p_requester_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_booker      text;
  v_requester   text;
begin
  select booker into v_booker from mtg_bookings where id = p_booking_id;
  if v_booker is null then raise exception 'booking not found'; end if;

  select first_name || ' ' || last_name into v_requester
    from employees where employee_id = p_requester_id;

  if v_requester is null
     or regexp_replace(v_requester, '\s+', ' ', 'g') <> regexp_replace(v_booker, '\s+', ' ', 'g') then
    raise exception 'only the booker can remove attendees';
  end if;

  -- Don't allow kicking the booker themselves
  if v_requester = p_target_id then
    raise exception 'cannot remove the booker';
  end if;

  delete from mtg_attendees
    where booking_id = p_booking_id
      and employee_id = p_target_id;
end;
$body$;

revoke all on function public.mtg_remove_attendee(uuid, text, text) from public;
grant execute on function public.mtg_remove_attendee(uuid, text, text) to anon, authenticated;
