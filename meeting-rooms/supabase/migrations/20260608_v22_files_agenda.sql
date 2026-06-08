-- Migration v22 · 2026-06-08
-- Phase 3 of meeting-window: agenda items (lightweight inline) + file attachments.

-- ---------- Agenda (stored inline on the booking row) ----------
alter table public.mtg_bookings
  add column if not exists agenda jsonb default '[]'::jsonb;

create or replace function public.mtg_update_agenda(
  p_booking_id uuid,
  p_employee_id text,
  p_agenda jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_booker    text;
  v_full_name text;
begin
  select booker into v_booker from mtg_bookings where id = p_booking_id;
  if v_booker is null then raise exception 'booking not found'; end if;

  select first_name || ' ' || last_name into v_full_name
    from employees where employee_id = p_employee_id;

  if v_full_name <> v_booker
     and not exists (
       select 1 from mtg_attendees
        where booking_id = p_booking_id
          and employee_id = p_employee_id
          and status = 'joined'
     ) then
    raise exception 'only the booker or joined attendees can edit the agenda';
  end if;

  update mtg_bookings set agenda = coalesce(p_agenda, '[]'::jsonb)
   where id = p_booking_id;
end;
$body$;

revoke all on function public.mtg_update_agenda(uuid, text, jsonb) from public;
grant execute on function public.mtg_update_agenda(uuid, text, jsonb) to anon, authenticated;


-- ---------- Attachments ----------
create table if not exists public.mtg_attachments (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.mtg_bookings(id) on delete cascade,
  file_name   text not null,
  storage_path text not null,
  public_url  text,
  mime_type   text,
  size_bytes  bigint,
  uploaded_by text not null,
  uploaded_at timestamptz default now()
);

create index if not exists mtg_attachments_booking_idx
  on public.mtg_attachments (booking_id, uploaded_at);

alter table public.mtg_attachments enable row level security;

drop policy if exists mtg_attachments_all on public.mtg_attachments;
create policy mtg_attachments_all on public.mtg_attachments for all to anon, authenticated using (true) with check (true);


-- RPC: record an attachment (after the file itself was uploaded via supabase.storage)
create or replace function public.mtg_add_attachment(
  p_booking_id  uuid,
  p_employee_id text,
  p_file_name   text,
  p_storage_path text,
  p_public_url  text,
  p_mime_type   text,
  p_size_bytes  bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_id uuid;
  v_booker text;
  v_full_name text;
begin
  select booker into v_booker from mtg_bookings where id = p_booking_id;
  if v_booker is null then raise exception 'booking not found'; end if;

  select first_name || ' ' || last_name into v_full_name
    from employees where employee_id = p_employee_id;

  if v_full_name <> v_booker
     and not exists (
       select 1 from mtg_attendees
        where booking_id = p_booking_id
          and employee_id = p_employee_id
          and status = 'joined'
     ) then
    raise exception 'only the booker or joined attendees can upload files';
  end if;

  insert into mtg_attachments (booking_id, file_name, storage_path, public_url, mime_type, size_bytes, uploaded_by)
  values (p_booking_id, p_file_name, p_storage_path, p_public_url, p_mime_type, p_size_bytes, p_employee_id)
  returning id into v_id;

  return v_id;
end;
$body$;

revoke all on function public.mtg_add_attachment(uuid, text, text, text, text, text, bigint) from public;
grant execute on function public.mtg_add_attachment(uuid, text, text, text, text, text, bigint) to anon, authenticated;


-- RPC: list attachments for a booking
create or replace function public.mtg_list_attachments(p_booking_id uuid)
returns table (
  id           uuid,
  file_name    text,
  public_url   text,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  text,
  uploader_name text,
  uploaded_at  timestamptz
)
language sql
security definer
set search_path = public
as $body$
  select
    a.id,
    a.file_name,
    a.public_url,
    a.mime_type,
    a.size_bytes,
    a.uploaded_by,
    coalesce(e.first_name || ' ' || e.last_name, a.uploaded_by) as uploader_name,
    a.uploaded_at
  from mtg_attachments a
  left join employees e on e.employee_id = a.uploaded_by
  where a.booking_id = p_booking_id
  order by a.uploaded_at desc;
$body$;

revoke all on function public.mtg_list_attachments(uuid) from public;
grant execute on function public.mtg_list_attachments(uuid) to anon, authenticated;


-- RPC: delete an attachment (uploader only)
create or replace function public.mtg_delete_attachment(
  p_attachment_id uuid,
  p_employee_id   text
)
returns text  -- returns the storage_path so client can delete the blob too
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_path text;
  v_uploader text;
begin
  select storage_path, uploaded_by into v_path, v_uploader
    from mtg_attachments where id = p_attachment_id;
  if v_path is null then raise exception 'attachment not found'; end if;
  if v_uploader <> p_employee_id then
    raise exception 'only the uploader can delete';
  end if;
  delete from mtg_attachments where id = p_attachment_id;
  return v_path;
end;
$body$;

revoke all on function public.mtg_delete_attachment(uuid, text) from public;
grant execute on function public.mtg_delete_attachment(uuid, text) to anon, authenticated;


-- ---------- Storage bucket ----------
-- Create the bucket if it doesn't exist. Public-read so download links work
-- without signed URLs (no sensitive files expected — internal company stuff).
insert into storage.buckets (id, name, public)
values ('meeting-files', 'meeting-files', true)
on conflict (id) do nothing;

-- Allow anon + authenticated to upload, list, delete in this bucket
drop policy if exists "meeting-files insert" on storage.objects;
create policy "meeting-files insert" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'meeting-files');
drop policy if exists "meeting-files select" on storage.objects;
create policy "meeting-files select" on storage.objects for select to anon, authenticated
  using (bucket_id = 'meeting-files');
drop policy if exists "meeting-files delete" on storage.objects;
create policy "meeting-files delete" on storage.objects for delete to anon, authenticated
  using (bucket_id = 'meeting-files');
