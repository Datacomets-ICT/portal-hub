-- Migration v3 · 2026-04-23
-- Adds `position` column to employees table.
-- Run this ONCE in Supabase SQL Editor BEFORE seed_employees.sql.

alter table public.employees
  add column if not exists position text;
