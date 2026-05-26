-- Repair Phase 2 — RPCs for create + workflow + fetch detail
-- Idempotent. Run after schema_rpr_v1.sql.

-- ============================================================
-- 1. rpr_create_job — open a new repair ticket (JOB-YYYY-NNN)
-- ============================================================
create or replace function public.rpr_create_job(
  p_reporter_id   text,
  p_reporter_name text,
  p_reporter_dept text,
  p_service_type  text,
  p_repair_type   text,
  p_item          text,
  p_floor         text,
  p_zone          text,
  p_note          text,
  p_photo_urls    text[] default '{}'
)
returns text
language plpgsql
security definer
set search_path = public
as $body$
declare
  prefix    text;
  max_seq   int;
  new_id    text;
  yr        int;
begin
  yr := extract(year from now())::int;
  prefix := 'JOB-' || yr || '-';

  -- Get next sequence for this year
  select coalesce(max(substring(job_id from length(prefix) + 1)::int), 0)
    into max_seq
    from rpr_jobs
   where job_id like prefix || '%'
     and substring(job_id from length(prefix) + 1) ~ '^[0-9]+$';

  new_id := prefix || lpad((max_seq + 1)::text, 3, '0');

  insert into rpr_jobs (
    job_id, reporter_id, reporter_name, reporter_dept,
    service_type, repair_type, item, floor, zone,
    note, photo_urls, status, reported_at, opened_at
  ) values (
    new_id, p_reporter_id, p_reporter_name, p_reporter_dept,
    coalesce(p_service_type, 'ใบแจ้งซ่อม'),
    p_repair_type, p_item, p_floor, p_zone,
    p_note, coalesce(p_photo_urls, '{}'),
    'รอดำเนินการ', now(), now()
  );

  return new_id;
end;
$body$;

revoke all on function public.rpr_create_job(text, text, text, text, text, text, text, text, text, text[]) from public;
grant execute on function public.rpr_create_job(text, text, text, text, text, text, text, text, text, text[]) to anon, authenticated;

-- ============================================================
-- 2. rpr_update_status — workflow transitions
-- ============================================================
-- Status flow:
--   รอดำเนินการ → กำลังดำเนินการ → [ดำเนินการสำเร็จ | ส่งช่างนอก | ยกเลิก]
--                                  ↓
--                       ดำเนินการสำเร็จ → ปิดงานแล้ว
--
-- When transitioning to "ดำเนินการสำเร็จ", repair_detail + assigned_to
-- + after_photo_urls (≥1) are required.
create or replace function public.rpr_update_status(
  p_job_id            text,
  p_status            text,
  p_assigned_to       text default null,    -- ช่าง (set when starting)
  p_repair_detail     text default null,    -- วิธีการแก้ไข (required for ดำเนินการสำเร็จ)
  p_after_photo_urls  text[] default null,  -- รูปหลังซ่อม (required for ดำเนินการสำเร็จ)
  p_is_repairable     boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  job rpr_jobs%rowtype;
begin
  select * into job from rpr_jobs where job_id = p_job_id;
  if not found then
    raise exception 'job % not found', p_job_id;
  end if;

  -- Validation: ดำเนินการสำเร็จ requires proof
  if p_status = 'ดำเนินการสำเร็จ' then
    if coalesce(p_repair_detail, job.repair_detail, '') = '' then
      raise exception 'ต้องระบุวิธีการแก้ไขก่อนปิดงาน';
    end if;
    if coalesce(p_assigned_to, job.assigned_to, '') = '' then
      raise exception 'ต้องระบุผู้ซ่อมก่อนปิดงาน';
    end if;
    if coalesce(array_length(coalesce(p_after_photo_urls, job.after_photo_urls), 1), 0) = 0 then
      raise exception 'ต้องอัพโหลดรูปหลังซ่อมอย่างน้อย 1 รูป';
    end if;
  end if;

  update rpr_jobs
     set status           = p_status,
         assigned_to      = coalesce(p_assigned_to, assigned_to),
         repair_detail    = coalesce(p_repair_detail, repair_detail),
         after_photo_urls = coalesce(p_after_photo_urls, after_photo_urls),
         is_repairable    = coalesce(p_is_repairable, is_repairable),
         opened_at        = case
                              when status = 'รอดำเนินการ' and p_status = 'กำลังดำเนินการ'
                                then coalesce(opened_at, now())
                              else opened_at
                            end,
         resolved_at      = case
                              when p_status in ('ดำเนินการสำเร็จ', 'ไม่สำเร็จ')
                                then coalesce(resolved_at, now())
                              else resolved_at
                            end,
         closed_at        = case
                              when p_status = 'ปิดงานแล้ว'
                                then coalesce(closed_at, now())
                              else closed_at
                            end
   where job_id = p_job_id;
end;
$body$;

revoke all on function public.rpr_update_status(text, text, text, text, text[], boolean) from public;
grant execute on function public.rpr_update_status(text, text, text, text, text[], boolean) to anon, authenticated;

-- ============================================================
-- 3. rpr_get_job — fetch one job's full detail
-- ============================================================
create or replace function public.rpr_get_job(p_job_id text)
returns rpr_jobs
language sql
security definer
set search_path = public
as $body$
  select * from rpr_jobs where job_id = p_job_id;
$body$;

revoke all on function public.rpr_get_job(text) from public;
grant execute on function public.rpr_get_job(text) to anon, authenticated;
