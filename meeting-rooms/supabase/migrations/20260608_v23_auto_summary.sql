-- Migration v23 · 2026-06-08
-- Phase 4 of meeting-window: auto-generated AI summary based on chat + agenda
-- after the meeting ends. The Gemini call itself runs in a Vercel serverless
-- function (/api/meeting-auto-summary); this migration just adds the column
-- + a writer RPC the API uses to persist the result.

alter table public.mtg_bookings
  add column if not exists auto_summary jsonb,
  add column if not exists auto_summary_at timestamptz;

-- Used by the serverless function to write the summary back
create or replace function public.mtg_save_auto_summary(
  p_booking_id uuid,
  p_summary    jsonb
)
returns void
language sql
security definer
set search_path = public
as $body$
  update public.mtg_bookings
     set auto_summary = p_summary,
         auto_summary_at = now()
   where id = p_booking_id;
$body$;

revoke all on function public.mtg_save_auto_summary(uuid, jsonb) from public;
grant execute on function public.mtg_save_auto_summary(uuid, jsonb) to anon, authenticated;

-- Updated v28 — also returns the audio transcript / summary / decisions /
-- action_items from mtg_meeting_notes (if recording was uploaded), so the
-- auto-summarizer can blend voice content with chat + agenda + files.
create or replace function public.mtg_summary_inputs(p_booking_id uuid)
returns json
language sql
security definer
set search_path = public
as $body$
  select json_build_object(
    'booking', (select to_jsonb(b) - 'auto_summary' from mtg_bookings b where id = p_booking_id),
    'attendees', coalesce((
      select json_agg(json_build_object(
        'employee_id', a.employee_id,
        'name', trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')),
        'nickname', e.nickname,
        'status', a.status))
      from mtg_attendees a
      left join employees e on e.employee_id = a.employee_id
      where a.booking_id = p_booking_id
    ), '[]'::json),
    'messages', coalesce((
      select json_agg(json_build_object(
        'employee_id', m.employee_id,
        'name', trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')),
        'body', m.body,
        'at', m.created_at) order by m.created_at)
      from mtg_messages m
      left join employees e on e.employee_id = m.employee_id
      where m.booking_id = p_booking_id
    ), '[]'::json)
  );
$body$;

revoke all on function public.mtg_summary_inputs(uuid) from public;
grant execute on function public.mtg_summary_inputs(uuid) to anon, authenticated;
