-- ============================================================
-- Phase 7: Chat learning — save conversations + auto-learn from resolved tickets
-- ============================================================

-- ===== Chat logs table =====
create table if not exists chat_logs (
  id            bigserial primary key,
  session_id    text not null,
  employee_id   text,
  role          text not null,       -- 'user' or 'assistant'
  content       text not null,
  created_at    timestamptz not null default now()
);

create index if not exists chat_logs_session_idx on chat_logs(session_id);
create index if not exists chat_logs_created_idx on chat_logs(created_at desc);

alter table chat_logs enable row level security;

-- Anon can insert (for saving chat) and admins can read
drop policy if exists "chat_logs_insert" on chat_logs;
create policy "chat_logs_insert" on chat_logs
  for insert to anon with check (true);

drop policy if exists "chat_logs_read" on chat_logs;
create policy "chat_logs_read" on chat_logs
  for select to anon using (true);

-- ===== Auto-learn: when ticket is resolved with a reply, add to knowledge_base =====
-- This function runs AFTER update on tickets

create or replace function auto_learn_from_ticket()
returns trigger
language plpgsql
security definer
set search_path = public
as $body$
declare
  kb_exists boolean;
  kw text;
begin
  -- Only trigger when status changes to resolved AND reply is not empty
  if NEW.status = 'ดำเนินการเรียบร้อย'
     and coalesce(NEW.reply, '') <> ''
     and (OLD.status <> 'ดำเนินการเรียบร้อย' or coalesce(OLD.reply, '') <> coalesce(NEW.reply, ''))
  then
    -- Check if we already have this ticket in KB
    select exists(
      select 1 from knowledge_base
      where source = 'auto_learn' and source_ref = NEW.ticket_no
    ) into kb_exists;

    -- Build keywords from ticket fields
    kw := coalesce(NEW.job_type, '') || ' ' ||
          coalesce(NEW.issue_type, '') || ' ' ||
          coalesce(NEW.symptom, '') || ' ' ||
          coalesce(NEW.request, '');

    if kb_exists then
      -- Update existing entry
      update knowledge_base set
        content = 'ปัญหา: ' || coalesce(NEW.request, '') || chr(10) || 'วิธีแก้: ' || NEW.reply,
        keywords = kw,
        title = coalesce(NEW.job_type, '') || ' > ' || coalesce(NEW.issue_type, '') || ' > ' || coalesce(NEW.symptom, ''),
        created_at = now()
      where source = 'auto_learn' and source_ref = NEW.ticket_no;
    else
      -- Insert new entry
      insert into knowledge_base (source, source_ref, category, title, content, keywords)
      values (
        'auto_learn',
        NEW.ticket_no,
        coalesce(NEW.job_type, 'อื่นๆ'),
        coalesce(NEW.job_type, '') || ' > ' || coalesce(NEW.issue_type, '') || ' > ' || coalesce(NEW.symptom, ''),
        'ปัญหา: ' || coalesce(NEW.request, '') || chr(10) || 'วิธีแก้: ' || NEW.reply,
        kw
      );
    end if;
  end if;

  return NEW;
end;
$body$;

-- Create trigger
drop trigger if exists ticket_auto_learn on tickets;
create trigger ticket_auto_learn
  after update on tickets
  for each row
  execute function auto_learn_from_ticket();

-- ===== RPC: save chat message =====
create or replace function save_chat_message(
  p_session_id text,
  p_employee_id text,
  p_role text,
  p_content text
) returns void
language plpgsql
security definer
set search_path = public
as $body$
begin
  insert into chat_logs (session_id, employee_id, role, content)
  values (p_session_id, p_employee_id, p_role, p_content);
end;
$body$;

revoke all on function save_chat_message(text, text, text, text) from public;
grant execute on function save_chat_message(text, text, text, text) to anon, authenticated;

-- ===== RPC: get frequently asked questions (for admin dashboard) =====
create or replace function get_frequent_questions(p_limit int default 10)
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  result json;
begin
  select json_agg(row_to_json(t)) into result
  from (
    select
      content as question,
      count(*) as ask_count,
      max(created_at) as last_asked
    from chat_logs
    where role = 'user'
      and length(content) > 5
      and created_at > now() - interval '30 days'
    group by content
    having count(*) >= 2
    order by count(*) desc
    limit p_limit
  ) t;

  return coalesce(result, '[]'::json);
end;
$body$;

revoke all on function get_frequent_questions(int) from public;
grant execute on function get_frequent_questions(int) to anon, authenticated;
