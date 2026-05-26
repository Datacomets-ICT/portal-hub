-- ============================================================
-- Repair (ช่าง) app — Phase 1 schema
-- Tables namespaced rpr_ (matches mtg_/drv_ pattern).
-- ============================================================
-- Idempotent. Re-runnable. Run in Supabase SQL Editor.

-- ============================================================
-- 1. rpr_jobs — ใบแจ้งซ่อม (main repair tickets)
-- ============================================================
create table if not exists public.rpr_jobs (
  job_id              text primary key,             -- JOB-YYYY-NNN
  created_at          timestamptz not null default now(),

  -- Reporter (the employee who reported the issue)
  reporter_id         text,
  reporter_name       text,
  reporter_dept       text,

  -- Classification
  service_type        text,                          -- ประเภทบริการ (e.g. "ใบแจ้งซ่อม")
  repair_type         text,                          -- ประเภทการซ่อม (ปรับอากาศ/ปะปา/...)
  item                text,                          -- รายการ (แอร์/ประตู/...)

  -- Location
  floor               text,
  zone                text,

  -- Details
  reported_at         timestamptz,                   -- เวลาที่แจ้ง
  opened_at           timestamptz,                   -- เวลาที่เปิด (entry time)
  note                text,                          -- หมายเหตุ
  repair_detail       text,                          -- วิธีการแก้ไข

  -- Photos (before / after / monthly check)
  photo_urls          text[] default '{}',           -- รูปภาพ 1-4 (ก่อนซ่อม)
  after_photo_urls    text[] default '{}',           -- รูปหลังซ่อม
  monthly_photo_urls  text[] default '{}',           -- รูปตรวจประจำเดือน 1-4

  -- Workflow
  status              text not null default 'รอดำเนินการ',
  is_repairable       boolean,                       -- ซ่อมสำเร็จได้หรือไม่
  needs_withdrawal    boolean,                       -- เบิกหรือไม่
  needs_borrow        boolean,                       -- ยืมหรือไม่
  needs_return        boolean,                       -- คืนหรือไม่

  -- Workers
  data_entry_by       text,                          -- ผู้กรอกข้อมูล
  assigned_to         text,                          -- ผู้ซ่อม (ช่าง)

  -- CEO approval (for borrow / buy quotes)
  approval_status     text,                          -- null | pending | approved | rejected
  approved_by         text,                          -- คุณจุ๋ม / คุณอู๋
  approved_at         timestamptz,

  -- Closure
  resolved_at         timestamptz,                   -- เวลาที่ช่างดำเนินการสำเร็จ
  closed_at           timestamptz                    -- ปิดงานสมบูรณ์
);

create index if not exists rpr_jobs_status_idx    on rpr_jobs(status);
create index if not exists rpr_jobs_reporter_idx  on rpr_jobs(reporter_id);
create index if not exists rpr_jobs_reported_idx  on rpr_jobs(reported_at desc nulls last);
create index if not exists rpr_jobs_assigned_idx  on rpr_jobs(assigned_to);

alter table rpr_jobs enable row level security;
drop policy if exists rpr_jobs_all on rpr_jobs;
create policy rpr_jobs_all on rpr_jobs for all using (true) with check (true);

-- ============================================================
-- 2. rpr_inspections — ใบตรวจประจำเดือน
-- ============================================================
create table if not exists public.rpr_inspections (
  irid              text primary key,                -- IRID000001
  created_at        timestamptz not null default now(),

  inspector_id      text,
  inspector_name    text,
  dept              text,

  inspected_at      timestamptz,
  inspection_type   text,                            -- น้ำ / ไฟ / ความปลอดภัย / ตรวจประจำเดือน
  item              text,                            -- รายการที่ตรวจ

  floor             text,
  zone              text,
  detail            text,                            -- รายละเอียดการตรวจ

  photo_urls        text[] default '{}'              -- รูปประจำเดือน 1-4
);

create index if not exists rpr_inspections_inspector_idx on rpr_inspections(inspector_id);
create index if not exists rpr_inspections_at_idx        on rpr_inspections(inspected_at desc nulls last);
create index if not exists rpr_inspections_type_idx      on rpr_inspections(inspection_type);

alter table rpr_inspections enable row level security;
drop policy if exists rpr_inspections_all on rpr_inspections;
create policy rpr_inspections_all on rpr_inspections for all using (true) with check (true);

-- ============================================================
-- 3. Storage bucket for repair photos / PDFs
-- ============================================================
insert into storage.buckets (id, name, public)
values ('repair-attachments', 'repair-attachments', true)
on conflict (id) do nothing;

drop policy if exists "repair_attachments_anon_insert" on storage.objects;
create policy "repair_attachments_anon_insert" on storage.objects
  for insert to anon with check (bucket_id = 'repair-attachments');

drop policy if exists "repair_attachments_anon_read" on storage.objects;
create policy "repair_attachments_anon_read" on storage.objects
  for select to anon using (bucket_id = 'repair-attachments');

-- ============================================================
-- 4. RPC — list jobs for hub page (with quick filters)
-- ============================================================
create or replace function public.rpr_list_jobs(
  p_status   text  default null,   -- filter by status (null = all)
  p_limit    int   default 100,
  p_offset   int   default 0
)
returns table (
  job_id          text,
  reporter_name   text,
  reporter_dept   text,
  repair_type     text,
  item            text,
  floor           text,
  zone            text,
  reported_at     timestamptz,
  status          text,
  assigned_to     text,
  is_repairable   boolean,
  photo_count     int
)
language sql
security definer
set search_path = public
as $body$
  select
    j.job_id,
    j.reporter_name,
    j.reporter_dept,
    j.repair_type,
    j.item,
    j.floor,
    j.zone,
    j.reported_at,
    j.status,
    j.assigned_to,
    j.is_repairable,
    coalesce(array_length(j.photo_urls, 1), 0) as photo_count
  from rpr_jobs j
  where (p_status is null or j.status = p_status)
  order by
    case j.status
      when 'รอดำเนินการ'   then 1
      when 'กำลังดำเนินการ' then 2
      when 'รออนุมัติ'      then 3
      when 'รอช่างนอก'      then 4
      when 'ดำเนินการสำเร็จ' then 5
      when 'ปิดงานแล้ว'     then 6
      when 'ยกเลิก'         then 7
      else 99
    end,
    j.reported_at desc nulls last
  limit p_limit
  offset p_offset;
$body$;

revoke all on function public.rpr_list_jobs(text, int, int) from public;
grant execute on function public.rpr_list_jobs(text, int, int) to anon, authenticated;

-- ============================================================
-- 5. RPC — quick status counts (for hub badges)
-- ============================================================
create or replace function public.rpr_job_counts()
returns table (status text, n bigint)
language sql
security definer
set search_path = public
as $body$
  select status, count(*) as n
  from rpr_jobs
  group by status
  order by n desc;
$body$;

revoke all on function public.rpr_job_counts() from public;
grant execute on function public.rpr_job_counts() to anon, authenticated;
