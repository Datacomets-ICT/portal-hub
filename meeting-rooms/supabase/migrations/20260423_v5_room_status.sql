-- Migration v5 · 2026-04-23
-- Sync room statuses from rooms.xlsx. Run in Supabase SQL Editor.
-- After this runs, the app hides rooms where status = 'unavailable'.

update public.rooms
set status = v.status
from (values
  ('C001', 'unavailable'),
  ('C002', 'unavailable'),
  ('C003', 'unavailable'),
  ('C004', 'unavailable'),
  ('C005', 'unavailable'),
  ('C006', 'unavailable'),
  ('C007', 'unavailable'),
  ('C011', 'unavailable'),
  ('C019', 'unavailable')
) as v(id, status)
where rooms.id = v.id;

-- Ensure everyone else is available
update public.rooms set status = 'available'
where id not in ('C001','C002','C003','C004','C005','C006','C007','C011','C019');
