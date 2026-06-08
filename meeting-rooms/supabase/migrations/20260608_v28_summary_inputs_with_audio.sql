-- Migration v28 · 2026-06-08
-- mtg_summary_inputs now also returns the audio recording's transcript /
-- summary / decisions / action items from mtg_meeting_notes (if a recording
-- exists) so the auto-summarizer can fuse voice content with chat / agenda /
-- attachment text. The caller (api/meeting-auto-summary.js) decides what to
-- weight more.

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
    ), '[]'::json),
    'audio_note', (
      select json_build_object(
        'transcript',        n.transcript,
        'summary',           n.summary,
        'decisions',         n.decisions,
        'discussion_topics', n.discussion_topics,
        'action_items',      n.action_items,
        'next_meeting',      n.next_meeting,
        'language',          n.language,
        'duration_sec',      n.duration_sec,
        'status',            n.status)
      from mtg_meeting_notes n
      where n.booking_id = p_booking_id
        and n.status in ('done', 'ready', 'generating')
      order by n.updated_at desc
      limit 1
    )
  );
$body$;

revoke all on function public.mtg_summary_inputs(uuid) from public;
grant execute on function public.mtg_summary_inputs(uuid) to anon, authenticated;
