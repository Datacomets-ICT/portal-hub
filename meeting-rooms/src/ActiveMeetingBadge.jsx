// ActiveMeetingBadge — top-bar pill that tells the current user if they're
// in a meeting RIGHT NOW (booker or joined attendee whose start/end window
// straddles the current minute). Clicking it opens the meeting popout.
//
// Refreshes every minute so it appears/disappears automatically as
// meetings begin and end.
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase.js';

function fmtMin(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function normName(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

export default function ActiveMeetingBadge({ currentUser, onOpen }) {
  const [active, setActive] = useState(null); // { id, title, start, end, room_id }
  const [now, setNow] = useState(() => new Date());

  // Tick once a minute so the badge flips off at end_min without manual reload
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!currentUser?.code || !currentUser?.name) return;
    let alive = true;
    (async () => {
      const todayStr = now.toISOString().slice(0, 10);
      const minNow = now.getHours() * 60 + now.getMinutes();
      // pull today's bookings where I'm either the booker or a joined invitee
      const [bookerRes, invitedRes] = await Promise.all([
        supabase
          .from('mtg_bookings')
          .select('id, room_id, title, start_min, end_min, booker, ended_at')
          .eq('booking_date', todayStr)
          .lte('start_min', minNow)
          .gte('end_min', minNow + 1),
        supabase.rpc('mtg_my_invites', { p_employee_id: currentUser.code }),
      ]);

      // Drop bookings that were manually ended early (ended_at <= now)
      const isStillRunning = (b) => !b.ended_at || new Date(b.ended_at) > now;

      const mine = (bookerRes.data || [])
        .filter((b) => normName(b.booker) === normName(currentUser.name))
        .filter(isStillRunning);

      const joined = (invitedRes.data || [])
        .filter((i) => i.status === 'joined' && i.booking_date === todayStr)
        .filter((i) => i.start_min <= minNow && i.end_min > minNow)
        .filter((i) => !i.ended_at || new Date(i.ended_at) > now)
        .map((i) => ({
          id: i.booking_id,
          room_id: i.room_id,
          title: i.title,
          start_min: i.start_min,
          end_min: i.end_min,
          booker: i.booker,
          ended_at: i.ended_at,
        }));

      const all = [...mine, ...joined];
      // dedupe by booking id, prefer mine (booker)
      const seen = new Set();
      const uniq = all.filter((b) => {
        if (seen.has(b.id)) return false;
        seen.add(b.id);
        return true;
      });

      if (alive) setActive(uniq[0] || null);
    })();
    return () => { alive = false; };
  }, [currentUser?.code, currentUser?.name, now]);

  if (!active) return null;
  return (
    <button
      type="button"
      className="active-meeting-badge"
      onClick={() => onOpen && onOpen(active)}
      title="คลิกเพื่อเปิดหน้าต่างประชุม"
    >
      <span className="amb-dot" />
      <span className="amb-text">
        <span className="amb-label">กำลังประชุม</span>
        <span className="amb-title">{active.title}</span>
      </span>
      <span className="amb-time">{fmtMin(active.start_min)}–{fmtMin(active.end_min)}</span>
    </button>
  );
}
