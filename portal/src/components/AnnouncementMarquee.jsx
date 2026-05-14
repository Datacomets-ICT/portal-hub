import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

// Bottom-right scrolling ticker — picks up the latest active
// announcement from get_active_announcement and slides the text
// from right to left on a loop.
//
// Polls every 60 s. Cheaper than a realtime subscription for this
// volume (1-2 announcements per week tops) and survives connection
// drops without reconnect logic.
//
// Each user can dismiss locally (per-tab). Dismiss is keyed on the
// announcement id so a NEW announcement re-shows even if the previous
// one was dismissed.
const POLL_MS = 60_000;
const DISMISSED_KEY = 'workspace_dismissed_announcement_id';

export default function AnnouncementMarquee() {
  const [item, setItem] = useState(null);
  const [dismissedId, setDismissedId] = useState(() => {
    try {
      return Number(localStorage.getItem(DISMISSED_KEY)) || 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    let alive = true;
    async function fetchOnce() {
      const { data, error } = await supabase.rpc('get_active_announcement');
      if (!alive) return;
      if (error || !data || data.length === 0) {
        setItem(null);
        return;
      }
      setItem(data[0]);
    }
    fetchOnce();
    const t = setInterval(fetchOnce, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const dismiss = () => {
    if (!item) return;
    setDismissedId(item.id);
    try {
      localStorage.setItem(DISMISSED_KEY, String(item.id));
    } catch {}
  };

  if (!item) return null;
  if (item.id === dismissedId) return null;

  return (
    <div className="ann-marquee" role="status" aria-label="ประกาศระบบ">
      <span className="ann-marquee-icon" aria-hidden>📢</span>
      <div className="ann-marquee-track">
        {/* Two copies of the message back-to-back so the loop is seamless */}
        <span className="ann-marquee-msg">{item.message}</span>
        <span className="ann-marquee-msg" aria-hidden>{item.message}</span>
      </div>
      <button
        type="button"
        className="ann-marquee-x"
        onClick={dismiss}
        aria-label="ปิดประกาศ"
        title="ปิด"
      >
        ✕
      </button>
    </div>
  );
}
