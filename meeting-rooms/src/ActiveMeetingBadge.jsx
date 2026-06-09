// ActiveMeetingBadge — top-bar pill that surfaces either:
//   • the meeting the user is currently IN (start <= now < end), OR
//   • the next upcoming meeting today (with HH:MM countdown).
// In-progress wins over upcoming. Clicking opens the meeting popout.
// Tick every 30s so the countdown stays fresh.
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase.js';

function fmtMin(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function normName(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

function fmtCountdown(mins) {
  if (mins < 1) return 'อีกไม่ถึง 1 นาที';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `อีก ${h} ชม. ${m} นาที`;
  if (h > 0)          return `อีก ${h} ชม.`;
  return `อีก ${m} นาที`;
}

export default function ActiveMeetingBadge({ currentUser, onOpen }) {
  const [target, setTarget] = useState(null);
  // { id, title, start_min, end_min, room_id, state: 'live'|'upcoming' }
  const [now, setNow] = useState(() => new Date());

  // Tick every 30s so countdown moves smoothly without burning CPU
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!currentUser?.code || !currentUser?.name) return;
    let alive = true;
    (async () => {
      const todayStr = now.toISOString().slice(0, 10);
      const minNow = now.getHours() * 60 + now.getMinutes();

      const [allTodayRes, invitedRes] = await Promise.all([
        // Every booking today (not yet ended) where I'm the booker
        supabase
          .from('mtg_bookings')
          .select('id, room_id, title, start_min, end_min, booker, ended_at')
          .eq('booking_date', todayStr)
          .gte('end_min', minNow + 1),
        supabase.rpc('mtg_my_invites', { p_employee_id: currentUser.code }),
      ]);

      const stillRunning = (b) => !b.ended_at || new Date(b.ended_at) > now;

      const mine = (allTodayRes.data || [])
        .filter((b) => normName(b.booker) === normName(currentUser.name))
        .filter(stillRunning);

      const joined = (invitedRes.data || [])
        .filter((i) => i.status === 'joined' && i.booking_date === todayStr)
        .filter((i) => i.end_min > minNow)
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

      // Dedupe by booking id (booker entry wins)
      const seen = new Set();
      const candidates = [...mine, ...joined].filter((b) => {
        if (seen.has(b.id)) return false;
        seen.add(b.id);
        return true;
      });

      // Pick the most relevant:
      //   1) one currently live (start <= now < end) — closest to start wins
      //   2) otherwise the next upcoming (smallest start_min > now)
      const live = candidates
        .filter((b) => b.start_min <= minNow && b.end_min > minNow)
        .sort((a, b) => b.start_min - a.start_min);
      const upcoming = candidates
        .filter((b) => b.start_min > minNow)
        .sort((a, b) => a.start_min - b.start_min);

      const chosen = live[0]
        ? { ...live[0], state: 'live' }
        : upcoming[0]
          ? { ...upcoming[0], state: 'upcoming' }
          : null;

      if (alive) setTarget(chosen);
    })();
    return () => { alive = false; };
  }, [currentUser?.code, currentUser?.name, now]);

  if (!target) return null;

  const isLive = target.state === 'live';
  const minNow = now.getHours() * 60 + now.getMinutes();
  const minsUntil = Math.max(0, target.start_min - minNow);

  return (
    <button
      type="button"
      className={`active-meeting-badge${isLive ? '' : ' is-upcoming'}`}
      onClick={() => onOpen && onOpen(target)}
      title={isLive ? 'คลิกเพื่อเปิดหน้าต่างประชุม' : 'การประชุมที่กำลังจะมาถึง — คลิกดูรายละเอียด'}
    >
      <span className="amb-dot" />
      <span className="amb-text">
        <span className="amb-label">
          {isLive ? 'กำลังประชุม' : fmtCountdown(minsUntil)}
        </span>
        <span className="amb-title">{target.title}</span>
      </span>
      <span className="amb-time">{fmtMin(target.start_min)}–{fmtMin(target.end_min)}</span>
    </button>
  );
}
