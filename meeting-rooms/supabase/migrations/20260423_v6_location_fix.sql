-- Migration v6 · 2026-04-23
-- Move rooms C019–C022 and C034/C035 from 'ICT' to 'Comets HQ'
-- (these were mis-located in the initial seed)

update public.rooms
set location = 'Comets HQ'
where id in ('C019', 'C020', 'C021', 'C022', 'C034', 'C035');
