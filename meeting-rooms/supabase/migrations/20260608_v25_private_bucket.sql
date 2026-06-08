-- Migration v25 · 2026-06-08
-- Switch the meeting-files bucket from public-read to private.
-- Files are still uploadable / listable / deletable by anon (the RPCs gate
-- by booking attendance), but they're no longer fetchable via the static
-- public_url. The client must now mint a signed URL via supabase.storage.
-- This stops leaked URLs from working past 1 hour.

update storage.buckets set public = false where id = 'meeting-files';

-- Policies on storage.objects already allow anon to select/insert/delete
-- in this bucket (v22). With public=false, anon CAN still read via the
-- object API + signed URLs, just not via the static /public/ CDN path.
