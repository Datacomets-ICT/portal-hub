-- ============================================================
-- Phase 5: Knowledge Base for AI chatbot RAG
-- Run this entire file in Supabase SQL Editor (safe to re-run)
-- ============================================================

create table if not exists knowledge_base (
  id          bigserial primary key,
  source      text not null,         -- 'ticket_reply', 'manual', 'faq'
  source_ref  text,                  -- ticket_no or filename
  category    text,                  -- job_type or manual category
  title       text,                  -- short title / symptom
  content     text not null,         -- the actual knowledge text
  keywords    text,                  -- space-separated keywords for search
  created_at  timestamptz not null default now()
);

create index if not exists kb_keywords_idx on knowledge_base using gin (to_tsvector('simple', coalesce(keywords, '') || ' ' || coalesce(title, '') || ' ' || coalesce(content, '')));
create index if not exists kb_category_idx on knowledge_base(category);
create index if not exists kb_source_idx on knowledge_base(source);

alter table knowledge_base enable row level security;

drop policy if exists "kb_read" on knowledge_base;
create policy "kb_read" on knowledge_base
  for select to anon using (true);

-- ===== search_knowledge() RPC =====
-- Full-text search + keyword matching, returns top N results

create or replace function search_knowledge(p_query text, p_limit int default 5)
returns json
language plpgsql
security definer
set search_path = public
as $body$
declare
  result json;
  search_tsquery tsquery;
begin
  -- Build tsquery from user input (split by spaces, OR them)
  search_tsquery := plainto_tsquery('simple', p_query);

  select json_agg(row_to_json(t)) into result
  from (
    select
      id,
      source,
      source_ref  as "sourceRef",
      category,
      title,
      content,
      ts_rank(
        to_tsvector('simple', coalesce(keywords, '') || ' ' || coalesce(title, '') || ' ' || coalesce(content, '')),
        search_tsquery
      ) as rank
    from knowledge_base
    where to_tsvector('simple', coalesce(keywords, '') || ' ' || coalesce(title, '') || ' ' || coalesce(content, ''))
          @@ search_tsquery
    order by rank desc
    limit p_limit
  ) t;

  return coalesce(result, '[]'::json);
end;
$body$;

revoke all on function search_knowledge(text, int) from public;
grant execute on function search_knowledge(text, int) to anon, authenticated;
