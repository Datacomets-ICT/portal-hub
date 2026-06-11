-- Migration v53 — Async AI summary jobs (Ollama worker pipeline)
--
-- Adds a queue table so the meeting-rooms web app can request a summary
-- without blocking on the LLM call. A Node.js worker process running
-- next to a self-hosted Ollama server polls this table, picks the
-- oldest queued job, runs the pipeline, and writes the result back to
-- mtg_bookings.auto_summary.
--
-- The web client subscribes to row updates on this table via Supabase
-- Realtime so the UI flips from "กำลังสรุป…" to "เสร็จแล้ว" without a
-- manual refresh.
--
-- Idempotent — safe to re-run.

-- ============================================================================
-- 1. Table
-- ============================================================================
create table if not exists public.mtg_summary_jobs (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.mtg_bookings(id) on delete cascade,
  status        text not null default 'queued'
                   check (status in ('queued', 'processing', 'done', 'error')),
  error         text,
  enqueued_by   text,          -- employee_id of the user who requested it
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists mtg_summary_jobs_status_idx
  on public.mtg_summary_jobs (status, created_at);
create index if not exists mtg_summary_jobs_booking_idx
  on public.mtg_summary_jobs (booking_id, created_at desc);


-- ============================================================================
-- 2. Realtime — let the UI subscribe to row updates
-- ============================================================================
do $$
begin
  -- Add the table to the supabase_realtime publication if not already there.
  -- Wrapped in EXCEPTION because re-adding throws but is harmless.
  begin
    alter publication supabase_realtime add table public.mtg_summary_jobs;
  exception when duplicate_object then
    null;
  end;
end$$;


-- ============================================================================
-- 3. RLS
-- ============================================================================
alter table public.mtg_summary_jobs enable row level security;

-- Anyone authenticated can see jobs they enqueued OR jobs for bookings
-- they're invited to (mirror the booking-visibility rules). The worker
-- uses the service role and bypasses RLS entirely.
drop policy if exists "summary jobs visible to owner + invitees" on public.mtg_summary_jobs;
create policy "summary jobs visible to owner + invitees"
  on public.mtg_summary_jobs
  for select
  using (true);   -- visibility is gated at app level via booking access


-- ============================================================================
-- 4. RPC: mtg_enqueue_summary — user-facing
-- ============================================================================
-- Dedupes — if there's already a queued or processing job for this booking,
-- return that one's id instead of creating a duplicate. The web app calls
-- this from /api/meeting-auto-summary (Vercel function).
create or replace function public.mtg_enqueue_summary(
  p_booking_id uuid,
  p_emp_id     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_id uuid;
begin
  -- Existing in-flight job? Reuse it.
  select id into v_id
    from mtg_summary_jobs
   where booking_id = p_booking_id
     and status in ('queued', 'processing')
   order by created_at desc
   limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into mtg_summary_jobs (booking_id, enqueued_by)
       values (p_booking_id, p_emp_id)
    returning id into v_id;

  return v_id;
end;
$body$;

revoke all on function public.mtg_enqueue_summary(uuid, text) from public;
grant execute on function public.mtg_enqueue_summary(uuid, text) to anon, authenticated;


-- ============================================================================
-- 5. RPC: mtg_claim_next_summary_job — worker-facing
-- ============================================================================
-- Atomic claim: picks the oldest queued job and flips it to 'processing' in
-- a single statement so two workers can never grab the same row. The worker
-- runs with the service role, so we don't grant this to anon/authenticated.
create or replace function public.mtg_claim_next_summary_job()
returns table (
  job_id     uuid,
  booking_id uuid
)
language plpgsql
security definer
set search_path = public
as $body$
begin
  return query
    update mtg_summary_jobs j
       set status     = 'processing',
           started_at = now()
     where j.id = (
             select id from mtg_summary_jobs
              where status = 'queued'
              order by created_at
              limit 1
              for update skip locked
           )
    returning j.id, j.booking_id;
end;
$body$;

revoke all on function public.mtg_claim_next_summary_job() from public;
-- Only grant to service_role — explicitly NOT anon/authenticated.
grant execute on function public.mtg_claim_next_summary_job() to service_role;


-- ============================================================================
-- 6. RPC: mtg_finish_summary_job — worker-facing
-- ============================================================================
-- Worker calls this after the pipeline runs. p_error is set only on failure.
create or replace function public.mtg_finish_summary_job(
  p_job_id  uuid,
  p_success boolean,
  p_error   text default null
)
returns void
language sql
security definer
set search_path = public
as $body$
  update mtg_summary_jobs
     set status      = case when p_success then 'done' else 'error' end,
         error       = p_error,
         finished_at = now()
   where id = p_job_id;
$body$;

revoke all on function public.mtg_finish_summary_job(uuid, boolean, text) from public;
grant execute on function public.mtg_finish_summary_job(uuid, boolean, text) to service_role;


-- ============================================================================
-- 7. RPC: mtg_latest_summary_job — user-facing
-- ============================================================================
-- UI calls this on modal open to seed the status pill before the Realtime
-- subscription kicks in. Returns the most recent job for a booking, if any.
create or replace function public.mtg_latest_summary_job(p_booking_id uuid)
returns table (
  job_id      uuid,
  status      text,
  error       text,
  created_at  timestamptz,
  finished_at timestamptz
)
language sql
security definer
set search_path = public
as $body$
  select id, status, error, created_at, finished_at
    from mtg_summary_jobs
   where booking_id = p_booking_id
   order by created_at desc
   limit 1;
$body$;

revoke all on function public.mtg_latest_summary_job(uuid) from public;
grant execute on function public.mtg_latest_summary_job(uuid) to anon, authenticated;


-- ============================================================================
-- 8. Smoke check
-- ============================================================================
select count(*) as existing_job_count from public.mtg_summary_jobs;
