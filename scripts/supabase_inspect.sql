-- ============================================================
-- Supabase inspect v2 — accurate row counts + all tables/views/RPCs
-- Read-only. Run all 3 queries. Copy each result.
-- ============================================================

-- Force fresh stats so row counts are accurate
analyze;

-- ──────────────────────────────────────────────────────────
-- 1. ALL TABLES (with real row counts) — most important
-- ──────────────────────────────────────────────────────────
select
  c.relname                                      as table_name,
  s.n_live_tup                                   as live_rows,
  pg_size_pretty(pg_total_relation_size(c.oid))  as size,
  to_char(s.last_vacuum,  'YYYY-MM-DD HH24:MI')  as last_vacuum,
  to_char(s.last_analyze, 'YYYY-MM-DD HH24:MI')  as last_analyze
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_stat_user_tables s on s.relid = c.oid
where n.nspname = 'public'
  and c.relkind = 'r'
order by s.n_live_tup desc nulls last, c.relname;

-- ──────────────────────────────────────────────────────────
-- 2. ALL VIEWS
-- ──────────────────────────────────────────────────────────
select
  c.relname as view_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
order by c.relname;

-- ──────────────────────────────────────────────────────────
-- 3. ALL RPC FUNCTIONS (user-defined only)
-- ──────────────────────────────────────────────────────────
select
  p.proname                                 as function_name,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'   -- functions (not aggregates/procs)
order by p.proname;
