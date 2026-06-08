-- v25b · 2026-06-08
-- mtg_list_attachments now also returns storage_path so the client can mint
-- signed URLs (we made the bucket private in v25).

drop function if exists public.mtg_list_attachments(uuid);

create function public.mtg_list_attachments(p_booking_id uuid)
returns table (
  id            uuid,
  file_name     text,
  storage_path  text,
  public_url    text,
  mime_type     text,
  size_bytes    bigint,
  uploaded_by   text,
  uploader_name text,
  uploaded_at   timestamptz
)
language sql
security definer
set search_path = public
as $body$
  select
    a.id,
    a.file_name,
    a.storage_path,
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
