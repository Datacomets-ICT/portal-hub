-- ============================================================
-- Phase 18: Paginated ticket fetch + tighten RLS
-- ============================================================

-- ============================================================
-- Main RPC: get_tickets_paginated
-- Returns { success, counts, filtered_total, tickets }
-- counts = per-status counts across ALL visible tickets (for summary cards)
-- filtered_total = count matching current filters (for "Load More" logic)
-- tickets = paginated slice sorted priority DESC then created_at DESC
-- ============================================================
create or replace function get_tickets_paginated(
  p_emp_id   text,
  p_password text,
  p_limit    int default 100,
  p_offset   int default 0,
  p_status   text default null,
  p_search   text default null,
  p_plant    text default null
) returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  emp        employees%rowtype;
  is_adm     boolean;
  search_pat text;
  result     json;
begin
  select * into emp from employees
  where employee_id = p_emp_id and password = p_password;
  if not found then
    return json_build_object('success', false, 'message', 'ไม่มีสิทธิ์');
  end if;

  is_adm     := coalesce(emp.is_admin, false);
  search_pat := case when p_search is null or p_search = '' then null
                     else '%' || lower(p_search) || '%' end;

  select json_build_object(
    'success', true,
    'counts', (
      select json_build_object(
        'total',       count(*),
        'open',        count(*) filter (where t.status = 'เปิด Ticket'),
        'inprogress',  count(*) filter (where t.status = 'กำลังดำเนินการ'),
        'approve',     count(*) filter (where t.status = 'ต้องการ Approve'),
        'resolved',    count(*) filter (where t.status = 'ดำเนินการเรียบร้อย'),
        'closed',      count(*) filter (where t.status = 'ปิดงานแล้ว'),
        'cancelled',   count(*) filter (where t.status = 'ยกเลิก')
      )
      from tickets t
      where (is_adm or t.employee_id = p_emp_id)
    ),
    'filtered_total', (
      select count(*) from tickets t
      where (is_adm or t.employee_id = p_emp_id)
        and (p_status is null or p_status = '' or p_status = 'all' or t.status = p_status)
        and (p_plant  is null or p_plant  = '' or t.plant  = p_plant)
        and (search_pat is null or
             lower(coalesce(t.ticket_no, '')) like search_pat or
             lower(coalesce(t.employee_name, '')) like search_pat or
             lower(coalesce(t.employee_id, '')) like search_pat or
             lower(coalesce(t.job_type, '')) like search_pat or
             lower(coalesce(t.issue_type, '')) like search_pat or
             lower(coalesce(t.symptom, '')) like search_pat or
             lower(coalesce(t.request, '')) like search_pat or
             lower(coalesce(t.detail, '')) like search_pat or
             lower(coalesce(t.admin, '')) like search_pat or
             lower(coalesce(t.location, '')) like search_pat or
             lower(coalesce(t.vnc_number, '')) like search_pat)
    ),
    'tickets', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json)
      from (
        select key, ticket_no, created_at, employee_id, employee_name,
               plant, job_type, issue_type, symptom, detail, request,
               vnc_number, phone, status, reply, admin, location,
               priority, due_at, resolved_at, photo_urls, file_urls
        from tickets t
        where (is_adm or t.employee_id = p_emp_id)
          and (p_status is null or p_status = '' or p_status = 'all' or t.status = p_status)
          and (p_plant  is null or p_plant  = '' or t.plant  = p_plant)
          and (search_pat is null or
               lower(coalesce(t.ticket_no, '')) like search_pat or
               lower(coalesce(t.employee_name, '')) like search_pat or
               lower(coalesce(t.employee_id, '')) like search_pat or
               lower(coalesce(t.job_type, '')) like search_pat or
               lower(coalesce(t.issue_type, '')) like search_pat or
               lower(coalesce(t.symptom, '')) like search_pat or
               lower(coalesce(t.request, '')) like search_pat or
               lower(coalesce(t.detail, '')) like search_pat or
               lower(coalesce(t.admin, '')) like search_pat or
               lower(coalesce(t.location, '')) like search_pat or
               lower(coalesce(t.vnc_number, '')) like search_pat)
        order by
          case coalesce(priority, 'medium')
            when 'urgent' then 0
            when 'high'   then 1
            when 'medium' then 2
            when 'low'    then 3
            else 9
          end,
          created_at desc
        limit greatest(1, least(p_limit, 500))
        offset greatest(0, p_offset)
      ) x
    )
  ) into result;

  return result;
end;
$body$;

revoke all on function get_tickets_paginated(text, text, int, int, text, text, text) from public;
grant execute on function get_tickets_paginated(text, text, int, int, text, text, text) to anon, authenticated;

-- ============================================================
-- Smaller RPCs for the few other direct-table-access spots
-- ============================================================

-- Distinct plants for ticket form dropdown
create or replace function get_plants_list()
returns json language plpgsql security definer set search_path = public
as $body$
begin
  return coalesce((
    select json_agg(plant order by plant)
    from (select distinct plant from tickets where plant is not null and plant <> '') p
  ), '[]'::json);
end;
$body$;
grant execute on function get_plants_list() to anon, authenticated;

-- Admin-only: tickets still open + unassigned (for notif panel)
create or replace function get_unassigned_tickets(p_emp_id text, p_password text)
returns json language plpgsql security definer set search_path = public
as $body$
declare
  emp employees%rowtype;
begin
  select * into emp from employees
  where employee_id = p_emp_id and password = p_password;
  if not found or not coalesce(emp.is_admin, false) then
    return '[]'::json;
  end if;
  return coalesce((
    select json_agg(row_to_json(t))
    from (
      select ticket_no, created_at, employee_name, request, symptom
      from tickets
      where status = 'เปิด Ticket' and (admin is null or admin = '')
      order by created_at desc
      limit 10
    ) t
  ), '[]'::json);
end;
$body$;
grant execute on function get_unassigned_tickets(text, text) to anon, authenticated;

-- Brief ticket info by keys (for chat-list enrichment)
create or replace function get_tickets_brief(p_emp_id text, p_password text, p_keys bigint[])
returns json language plpgsql security definer set search_path = public
as $body$
declare
  emp employees%rowtype;
  is_adm boolean;
begin
  select * into emp from employees where employee_id = p_emp_id and password = p_password;
  if not found then return '[]'::json; end if;
  is_adm := coalesce(emp.is_admin, false);
  return coalesce((
    select json_agg(row_to_json(t))
    from (
      select key, ticket_no, employee_name, status
      from tickets
      where key = any(p_keys)
        and (is_adm or employee_id = p_emp_id)
    ) t
  ), '[]'::json);
end;
$body$;
grant execute on function get_tickets_brief(text, text, bigint[]) to anon, authenticated;

-- ============================================================
-- Tighten RLS: remove permissive policies on tickets
-- (worklist stays readable — non-sensitive reference data)
-- All ticket access now goes through SECURITY DEFINER RPCs
-- ============================================================
drop policy if exists "tickets_read"   on tickets;
drop policy if exists "tickets_insert" on tickets;
-- intentionally leave tickets without read/insert policies for anon;
-- RLS enabled + no policies = no direct access for anon key
-- RPC functions use SECURITY DEFINER so they still work

-- Keep worklist readable (labels only)
drop policy if exists "worklist_read"     on worklist;
drop policy if exists "worklist_read_all" on worklist;
create policy "worklist_read_all" on worklist for select to anon using (true);
