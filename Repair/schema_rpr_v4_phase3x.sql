-- Repair Phase 3.2-3.5 — RPCs for create/update handovers + factory
-- requests + PDF batches + equipment + stock movements.
-- Idempotent. Run after v1/v2/v3.

-- ============================================================
-- 1. rpr_create_handover — parent + items in one shot
-- ============================================================
-- Items: jsonb array of {item, quantity, unit, note, photo_url}
create or replace function public.rpr_create_handover(
  p_delivered_at        timestamptz,
  p_recipient_addr      text,
  p_recipient_addr_other text,
  p_sender              text,
  p_recipient           text,
  p_authorized_person   text,
  p_note                text,
  p_items               jsonb default '[]'::jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $body$
declare
  prefix    text := 'D';
  max_seq   int;
  new_no    text;
  it        jsonb;
begin
  -- D00001 style sequence (matches legacy)
  select coalesce(max(substring(doc_no from 2)::int), 0)
    into max_seq
    from rpr_handovers
   where doc_no ~ '^D[0-9]+$';
  new_no := prefix || lpad((max_seq + 1)::text, 5, '0');

  insert into rpr_handovers (doc_no, delivered_at, recipient_addr,
    recipient_addr_other, sender, recipient, authorized_person, note)
  values (new_no, p_delivered_at, p_recipient_addr, p_recipient_addr_other,
    p_sender, p_recipient, p_authorized_person, p_note);

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into rpr_handover_items (doc_no, item, quantity, unit, note, photo_url)
    values (new_no,
      it->>'item',
      nullif(it->>'quantity', '')::numeric,
      it->>'unit',
      it->>'note',
      it->>'photo_url');
  end loop;

  return new_no;
end;
$body$;
grant execute on function public.rpr_create_handover(timestamptz, text, text, text, text, text, text, jsonb) to anon, authenticated;

create or replace function public.rpr_get_handover(p_doc_no text)
returns table (doc rpr_handovers, items jsonb)
language sql security definer set search_path = public as $$
  select h, coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'item', i.item, 'quantity', i.quantity,
      'unit', i.unit, 'note', i.note, 'photo_url', i.photo_url))
    from rpr_handover_items i where i.doc_no = h.doc_no), '[]'::jsonb)
  from rpr_handovers h where h.doc_no = p_doc_no;
$$;
grant execute on function public.rpr_get_handover(text) to anon, authenticated;

-- ============================================================
-- 2. rpr_create_factory_request + workflow transitions
-- ============================================================
create or replace function public.rpr_create_factory_request(
  p_requester   text,
  p_note        text,
  p_items       jsonb default '[]'::jsonb
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

  insert into rpr_factory_requests (doc_no, request_date, requester, status, note)
  values (new_no, now(), p_requester, 'รออนุมัติ', p_note);

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
grant execute on function public.rpr_create_factory_request(text, text, jsonb) to anon, authenticated;

create or replace function public.rpr_get_factory_request(p_doc_no text)
returns table (doc rpr_factory_requests, items jsonb)
language sql security definer set search_path = public as $$
  select f, coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'item', i.item, 'quantity', i.quantity, 'unit', i.unit))
    from rpr_factory_request_items i where i.doc_no = f.doc_no), '[]'::jsonb)
  from rpr_factory_requests f where f.doc_no = p_doc_no;
$$;
grant execute on function public.rpr_get_factory_request(text) to anon, authenticated;

-- Workflow: รออนุมัติ → อนุมัติ → จ่ายแล้ว → รับแล้ว
create or replace function public.rpr_update_factory_request(
  p_doc_no    text,
  p_action    text,         -- approve | reject | dispense | receive | cancel
  p_actor     text
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  fr rpr_factory_requests%rowtype;
begin
  select * into fr from rpr_factory_requests where doc_no = p_doc_no;
  if not found then raise exception 'doc % not found', p_doc_no; end if;

  case p_action
    when 'approve' then
      if fr.status <> 'รออนุมัติ' then raise exception 'ต้องอยู่สถานะ "รออนุมัติ" ก่อน'; end if;
      update rpr_factory_requests set status = 'อนุมัติ', approver = p_actor where doc_no = p_doc_no;
    when 'reject' then
      if fr.status <> 'รออนุมัติ' then raise exception 'ต้องอยู่สถานะ "รออนุมัติ" ก่อน'; end if;
      update rpr_factory_requests set status = 'ยกเลิก', approver = p_actor where doc_no = p_doc_no;
    when 'dispense' then
      if fr.status <> 'อนุมัติ' then raise exception 'ต้องอนุมัติก่อนถึงจะจ่ายได้'; end if;
      update rpr_factory_requests set status = 'จ่ายแล้ว', dispenser = p_actor where doc_no = p_doc_no;
    when 'receive' then
      if fr.status <> 'จ่ายแล้ว' then raise exception 'ต้องจ่ายก่อนถึงจะรับได้'; end if;
      update rpr_factory_requests set status = 'รับแล้ว', receiver = p_actor where doc_no = p_doc_no;
    when 'cancel' then
      update rpr_factory_requests set status = 'ยกเลิก' where doc_no = p_doc_no;
    else
      raise exception 'unknown action %', p_action;
  end case;
end;
$body$;
grant execute on function public.rpr_update_factory_request(text, text, text) to anon, authenticated;

-- ============================================================
-- 3. rpr_create_pdf_batch — one row, up to 5 PDFs
-- ============================================================
create or replace function public.rpr_create_pdf_batch(
  p_repair_url      text,
  p_withdrawal_url  text,
  p_borrow_url      text,
  p_return_url      text,
  p_handover_url    text,
  p_note            text default null
)
returns bigint
language sql
security definer
set search_path = public
as $body$
  insert into rpr_pdf_archive (
    pdf_repair_url, pdf_withdrawal_url, pdf_borrow_url,
    pdf_return_url, pdf_handover_url, note
  ) values (
    nullif(p_repair_url, ''), nullif(p_withdrawal_url, ''),
    nullif(p_borrow_url, ''), nullif(p_return_url, ''),
    nullif(p_handover_url, ''), p_note
  ) returning id;
$body$;
grant execute on function public.rpr_create_pdf_batch(text, text, text, text, text, text) to anon, authenticated;

-- ============================================================
-- 4. Equipment + stock movements
-- ============================================================
-- Upsert equipment master (used by both create and edit forms)
create or replace function public.rpr_upsert_equipment(
  p_stock_id  text,
  p_category  text,
  p_name      text,
  p_image_url text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $body$
declare
  new_id text := p_stock_id;
begin
  -- Mint a stock_id if none provided: <CAT><YYMMDD><NN> matching legacy
  if new_id is null or new_id = '' then
    new_id := upper(coalesce(left(p_category, 1), 'O'))
              || to_char(now(), 'YYMMDD')
              || lpad((
                  select coalesce(count(*), 0) + 1
                  from rpr_equipment
                  where stock_id like upper(coalesce(left(p_category, 1), 'O'))
                                   || to_char(now(), 'YYMMDD') || '%'
                )::text, 4, '0');
  end if;

  insert into rpr_equipment (stock_id, category, name, image_url)
  values (new_id, p_category, p_name, p_image_url)
  on conflict (stock_id) do update
    set category = excluded.category,
        name     = excluded.name,
        image_url = coalesce(excluded.image_url, rpr_equipment.image_url);

  return new_id;
end;
$body$;
grant execute on function public.rpr_upsert_equipment(text, text, text, text) to anon, authenticated;

-- Record one stock movement and bump quantity_on_hand atomically
create or replace function public.rpr_record_stock_move(
  p_stock_id      text,
  p_movement_type text,            -- รับเข้า | เบิก | คืน
  p_quantity      numeric,
  p_performed_by  text,
  p_floor         text default null,
  p_zone          text default null,
  p_job_id        text default null,
  p_note          text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $body$
declare
  eq rpr_equipment%rowtype;
  delta numeric;
  new_id bigint;
begin
  select * into eq from rpr_equipment where stock_id = p_stock_id;
  if not found then raise exception 'stock % not found', p_stock_id; end if;
  if coalesce(p_quantity, 0) <= 0 then raise exception 'จำนวนต้องมากกว่า 0'; end if;
  if p_movement_type not in ('รับเข้า', 'คืน', 'เบิก') then
    raise exception 'movement_type % is not valid (use รับเข้า/เบิก/คืน)', p_movement_type;
  end if;

  delta := case p_movement_type
             when 'รับเข้า' then  p_quantity
             when 'คืน'     then  p_quantity
             when 'เบิก'    then -p_quantity
           end;

  -- Insert ledger row
  insert into rpr_stock_moves (
    stock_id, stock_name, movement_type, quantity,
    performed_by, floor, zone, job_id, note
  ) values (
    p_stock_id, eq.name, p_movement_type, p_quantity,
    p_performed_by, p_floor, p_zone, p_job_id, p_note
  ) returning id into new_id;

  -- Update master on-hand
  update rpr_equipment
     set quantity_on_hand = coalesce(quantity_on_hand, 0) + delta,
         quantity_in      = case when p_movement_type = 'รับเข้า'
                                 then coalesce(quantity_in, 0) + p_quantity
                                 else quantity_in end
   where stock_id = p_stock_id;

  return new_id;
end;
$body$;

grant execute on function public.rpr_record_stock_move(text, text, numeric, text, text, text, text, text) to anon, authenticated;
