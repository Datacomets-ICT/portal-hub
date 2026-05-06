-- Migration v10 · 2026-04-23
-- Rename the 'PB Office' location to 'Phone Booth' (per user direction).
-- 'PB' in room IDs actually stands for Phone Booth (small meeting rooms).

update public.rooms
set location = 'Phone Booth'
where location = 'PB Office';
