-- Repair Phase 3 — equipment + handovers + factory requests + PDF archive
-- Idempotent. Run after v1 + v2.

-- ============================================================
-- 1. rpr_equipment — อุปกรณ์ master (stock)
-- ============================================================
create table if not exists public.rpr_equipment (
  stock_id            text primary key,            -- T2508030001
  category            text,                         -- ลักษณะสินค้า (Toilet, Light, ...)
  name                text,                         -- รายการ
  quantity_in         numeric default 0,            -- รับเข้า
  quantity_on_hand    numeric default 0,            -- คงเหลือ
  image_url           text,
  created_at          timestamptz not null default now()
);
create index if not exists rpr_equipment_cat_idx on rpr_equipment(category);

alter table rpr_equipment enable row level security;
drop policy if exists rpr_equipment_all on rpr_equipment;
create policy rpr_equipment_all on rpr_equipment for all using (true) with check (true);

-- ============================================================
-- 2. rpr_stock_moves — StockDetail (in/out ledger)
-- ============================================================
create table if not exists public.rpr_stock_moves (
  id              bigserial primary key,
  stock_id        text references rpr_equipment(stock_id) on delete cascade,
  stock_name      text,
  movement_type   text,                              -- รับเข้า | เบิก
  quantity        numeric,
  performed_by    text,                              -- ช่างที่เบิก
  floor           text,
  zone            text,
  job_id          text,                              -- ผูกกับ rpr_jobs (optional)
  performed_at    timestamptz not null default now(),
  note            text
);
create index if not exists rpr_stock_moves_stock_idx on rpr_stock_moves(stock_id);
create index if not exists rpr_stock_moves_at_idx    on rpr_stock_moves(performed_at desc);

alter table rpr_stock_moves enable row level security;
drop policy if exists rpr_stock_moves_all on rpr_stock_moves;
create policy rpr_stock_moves_all on rpr_stock_moves for all using (true) with check (true);

-- ============================================================
-- 3. rpr_handovers + items — ใบส่งมอบทรัพย์สิน
-- ============================================================
create table if not exists public.rpr_handovers (
  doc_no              text primary key,             -- D00038
  created_at          timestamptz not null default now(),
  delivered_at        timestamptz,
  recipient_addr      text,                          -- ที่อยู่ผู้รับ (Fac/ICT/อื่น ๆ)
  recipient_addr_other text,
  sender              text,                          -- ผู้ส่ง
  recipient           text,                          -- ผู้รับ
  authorized_person   text,                          -- ผู้รับมอบอำนาจ
  note                text,
  pdf_url             text
);
create index if not exists rpr_handovers_at_idx on rpr_handovers(delivered_at desc nulls last);

alter table rpr_handovers enable row level security;
drop policy if exists rpr_handovers_all on rpr_handovers;
create policy rpr_handovers_all on rpr_handovers for all using (true) with check (true);

create table if not exists public.rpr_handover_items (
  id            bigserial primary key,
  doc_no        text references rpr_handovers(doc_no) on delete cascade,
  item          text,
  quantity      numeric,
  unit          text,
  note          text,
  photo_url     text
);
create index if not exists rpr_handover_items_doc_idx on rpr_handover_items(doc_no);

alter table rpr_handover_items enable row level security;
drop policy if exists rpr_handover_items_all on rpr_handover_items;
create policy rpr_handover_items_all on rpr_handover_items for all using (true) with check (true);

-- ============================================================
-- 4. rpr_factory_requests + items — ใบขอเบิกจากโรงงาน
-- ============================================================
create table if not exists public.rpr_factory_requests (
  doc_no          text primary key,                 -- FR00001
  created_at      timestamptz not null default now(),
  request_date    timestamptz,
  requester       text,                              -- ผู้ขอเบิก
  approver        text,                              -- ผู้อนุมัติ
  dispenser       text,                              -- ผู้จ่าย
  receiver        text,                              -- ผู้รับ
  status          text not null default 'รออนุมัติ', -- รออนุมัติ | อนุมัติ | จ่ายแล้ว | รับแล้ว | ยกเลิก
  note            text
);
create index if not exists rpr_factory_requests_at_idx on rpr_factory_requests(request_date desc nulls last);

alter table rpr_factory_requests enable row level security;
drop policy if exists rpr_factory_requests_all on rpr_factory_requests;
create policy rpr_factory_requests_all on rpr_factory_requests for all using (true) with check (true);

create table if not exists public.rpr_factory_request_items (
  id          bigserial primary key,
  doc_no      text references rpr_factory_requests(doc_no) on delete cascade,
  item        text,
  quantity    numeric,
  unit        text
);
create index if not exists rpr_fr_items_doc_idx on rpr_factory_request_items(doc_no);

alter table rpr_factory_request_items enable row level security;
drop policy if exists rpr_factory_request_items_all on rpr_factory_request_items;
create policy rpr_factory_request_items_all on rpr_factory_request_items for all using (true) with check (true);

-- ============================================================
-- 5. rpr_pdf_archive — เก็บ PDF
-- ============================================================
create table if not exists public.rpr_pdf_archive (
  id                  bigserial primary key,
  imported_at         timestamptz not null default now(),
  pdf_repair_url      text,                          -- ใบแจ้งซ่อม
  pdf_withdrawal_url  text,                          -- ใบเบิกอุปกรณ์
  pdf_borrow_url      text,                          -- ใบขอยืมอุปกรณ์
  pdf_return_url      text,                          -- ใบขอคืนอุปกรณ์
  pdf_handover_url    text,                          -- ใบส่งมอบอุปกรณ์
  note                text
);
create index if not exists rpr_pdf_archive_at_idx on rpr_pdf_archive(imported_at desc);

alter table rpr_pdf_archive enable row level security;
drop policy if exists rpr_pdf_archive_all on rpr_pdf_archive;
create policy rpr_pdf_archive_all on rpr_pdf_archive for all using (true) with check (true);

-- ============================================================
-- 6. Simple list RPCs
-- ============================================================
create or replace function public.rpr_list_inspections(p_limit int default 100)
returns setof rpr_inspections
language sql security definer set search_path = public as $$
  select * from rpr_inspections order by inspected_at desc nulls last, irid desc limit p_limit;
$$;
grant execute on function public.rpr_list_inspections(int) to anon, authenticated;

create or replace function public.rpr_list_equipment(p_limit int default 200)
returns setof rpr_equipment
language sql security definer set search_path = public as $$
  select * from rpr_equipment order by category, name limit p_limit;
$$;
grant execute on function public.rpr_list_equipment(int) to anon, authenticated;
