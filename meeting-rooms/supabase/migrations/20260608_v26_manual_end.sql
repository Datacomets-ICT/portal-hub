-- Migration v26 · 2026-06-08
-- Add manual "end meeting now" for the booker. ended_at takes precedence
-- over end_min: if it's set and < now(), the meeting is considered past
-- (server-side locks apply, UI shows the banner, AI summary unlocks).

alter table public.mtg_bookings
  add column if not exists ended_at timestamptz;

-- The booker can call this to lock the meeting before its scheduled end.
create or replace function public.mtg_end_meeting(
  p_booking_id  uuid,
  p_employee_id text
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_booker text;
  v_full_name text;
  v_ts timestamptz := now();
begin
  select booker into v_booker from mtg_bookings where id = p_booking_id;
  if v_booker is null then raise exception 'booking not found'; end if;

  select first_name || ' ' || last_name into v_full_name
    from employees where employee_id = p_employee_id;

  if v_full_name <> v_booker then
    raise exception 'only the booker can end the meeting early';
  end if;

  update mtg_bookings set ended_at = v_ts where id = p_booking_id;
  return v_ts;
end;
$body$;

revoke all on function public.mtg_end_meeting(uuid, text) from public;
grant execute on function public.mtg_end_meeting(uuid, text) to anon, authenticated;


-- Re-define the three "lock" RPCs to consider ended_at as well as end_min.
-- (Previously they only looked at end_min.)
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
  v_end_ts    timestamp;
  v_ended_at  timestamptz;
begin
  if p_body is null or length(trim(p_body)) = 0 then raise exception 'message body required'; end if;
  if length(p_body) > 4000 then raise exception 'message too long'; end if;

  select booker,
         (booking_date + (end_min || ' minutes')::interval)::timestamp,
         ended_at
    into v_booker, v_end_ts, v_ended_at
  from mtg_bookings where id = p_booking_id;
  if v_booker is null then raise exception 'booking not found'; end if;
  if v_end_ts < now() or (v_ended_at is not null and v_ended_at < now()) then
    raise exception 'meeting already ended';
  end if;

  select first_name || ' ' || last_name into v_full_name
    from employees where employee_id = p_employee_id;

  if v_full_name <> v_booker
     and not exists (
       select 1 from mtg_attendees where booking_id = p_booking_id and employee_id = p_employee_id and status = 'joined'
     ) then raise exception 'you must join the meeting before posting'; end if;

  insert into mtg_messages (booking_id, employee_id, body)
  values (p_booking_id, p_employee_id, trim(p_body)) returning id into v_id;
  return v_id;
end;
$body$;
grant execute on function public.mtg_post_message(uuid, text, text) to anon, authenticated;


create or replace function public.mtg_update_agenda(
  p_booking_id uuid, p_employee_id text, p_agenda jsonb
)
returns void
language plpgsql security definer set search_path = public
as $body$
declare
  v_booker text; v_full_name text; v_end_ts timestamp; v_ended_at timestamptz;
begin
  select booker, (booking_date + (end_min || ' minutes')::interval)::timestamp, ended_at
    into v_booker, v_end_ts, v_ended_at from mtg_bookings where id = p_booking_id;
  if v_booker is null then raise exception 'booking not found'; end if;
  if v_end_ts < now() or (v_ended_at is not null and v_ended_at < now()) then
    raise exception 'meeting already ended';
  end if;

  select first_name || ' ' || last_name into v_full_name from employees where employee_id = p_employee_id;
  if v_full_name <> v_booker
     and not exists (select 1 from mtg_attendees where booking_id = p_booking_id and employee_id = p_employee_id and status = 'joined')
  then raise exception 'only the booker or joined attendees can edit the agenda'; end if;

  update mtg_bookings set agenda = coalesce(p_agenda, '[]'::jsonb) where id = p_booking_id;
end;
$body$;
grant execute on function public.mtg_update_agenda(uuid, text, jsonb) to anon, authenticated;


create or replace function public.mtg_add_attachment(
  p_booking_id uuid, p_employee_id text, p_file_name text,
  p_storage_path text, p_public_url text, p_mime_type text, p_size_bytes bigint
)
returns uuid
language plpgsql security definer set search_path = public
as $body$
declare
  v_id uuid; v_booker text; v_full_name text; v_end_ts timestamp; v_ended_at timestamptz;
begin
  select booker, (booking_date + (end_min || ' minutes')::interval)::timestamp, ended_at
    into v_booker, v_end_ts, v_ended_at from mtg_bookings where id = p_booking_id;
  if v_booker is null then raise exception 'booking not found'; end if;
  if v_end_ts < now() or (v_ended_at is not null and v_ended_at < now()) then
    raise exception 'meeting already ended';
  end if;

  select first_name || ' ' || last_name into v_full_name from employees where employee_id = p_employee_id;
  if v_full_name <> v_booker
     and not exists (select 1 from mtg_attendees where booking_id = p_booking_id and employee_id = p_employee_id and status = 'joined')
  then raise exception 'only the booker or joined attendees can upload files'; end if;

  insert into mtg_attachments (booking_id, file_name, storage_path, public_url, mime_type, size_bytes, uploaded_by)
  values (p_booking_id, p_file_name, p_storage_path, p_public_url, p_mime_type, p_size_bytes, p_employee_id)
  returning id into v_id;
  return v_id;
end;
$body$;
grant execute on function public.mtg_add_attachment(uuid, text, text, text, text, text, bigint) to anon, authenticated;
