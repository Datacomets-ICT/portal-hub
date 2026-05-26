-- Repair Phase 4 — inspection create RPC + factory-request RPC
-- with optional approver / dispenser / receiver fields.
-- Idempotent. Run after v1..v4.

-- ============================================================
-- 1. rpr_create_inspection — IRID000001 style sequence
-- ============================================================
create or replace function public.rpr_create_inspection(
  p_inspector_id    text,
  p_inspector_name  text,
  p_dept            text,
  p_inspected_at    timestamptz,
  p_inspection_type text,         -- น้ำ | ไฟ | ความปลอดภัย
  p_item            text,
  p_floor           text,
  p_zone            text,
  p_detail          text,
  p_photo_urls      text[] default null
)
returns text
language plpgsql
security definer
set search_path = public
as $body$
declare
  max_seq int;
  new_id  text;
begin
  select coalesce(max(substring(irid from 5)::int), 0)
    into max_seq
    from rpr_inspections
   where irid ~ '^IRID[0-9]+$';
  new_id := 'IRID' || lpad((max_seq + 1)::text, 6, '0');

  insert into rpr_inspections (
    irid, inspector_id, inspector_name, dept,
    inspected_at, inspection_type, item,
    floor, zone, detail, photo_urls
  ) values (
    new_id, p_inspector_id, p_inspector_name, p_dept,
    coalesce(p_inspected_at, now()), p_inspection_type, p_item,
    p_floor, p_zone, p_detail,
    coalesce(p_photo_urls, '{}'::text[])
  );

  return new_id;
end;
$body$;
grant execute on function public.rpr_create_inspection(
  text, text, text, timestamptz, text, text, text, text, text, text[]
) to anon, authenticated;

-- ============================================================
-- 2. rpr_create_factory_request — extended with optional fields
-- ============================================================
-- Drop the old 3-arg version (Postgres can't overload with defaults
-- when arg count differs and overlap)
drop function if exists public.rpr_create_factory_request(text, text, jsonb);

create or replace function public.rpr_create_factory_request(
  p_requester      text,
  p_note           text,
  p_items          jsonb        default '[]'::jsonb,
  p_request_date   timestamptz  default null,
  p_approver       text         default null,
  p_dispenser      text         default null,
  p_receiver       text         default null
)
returns text
language plpgsql
security definer
set search_path = public
as $body$
declare
  max_seq int;
  new_no  text;
  it      jsonb;
begin
  select coalesce(max(substring(doc_no from 3)::int), 0)
    into max_seq
    from rpr_factory_requests
   where doc_no ~ '^FR[0-9]+$';
  new_no := 'FR' || lpad((max_seq + 1)::text, 5, '0');

  insert into rpr_factory_requests (
    doc_no, request_date, requester, approver, dispenser, receiver, status, note
  )
  values (
    new_no,
    coalesce(p_request_date, now()),
    p_requester,
    nullif(p_approver, ''),
    nullif(p_dispenser, ''),
    nullif(p_receiver, ''),
    'รออนุมัติ',
    p_note
  );

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into rpr_factory_request_items (doc_no, item, quantity, unit)
    values (new_no,
      it->>'item',
      nullif(it->>'quantity', '')::numeric,
      it->>'unit');
  end loop;

  return new_no;
end;
$body$;
grant execute on function public.rpr_create_factory_request(
  text, text, jsonb, timestamptz, text, text, text
) to anon, authenticated;
