// InviteNotificationBar — floating bar that pops up in the top-right
// whenever the current user is added to mtg_attendees as 'invited'.
// Realtime: subscribes to INSERTs on mtg_attendees filtered to my employee_id.
import { useEffect, useState, useCallback } from 'react';
import { supabase } from './lib/supabase.js';

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function fmtTime(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
}

export default function InviteNotificationBar({ currentUser, onOpenMeeting }) {
  const [invites, setInvites] = useState([]); // pending invites (status='invited')
  const [dismissedIds, setDismissedIds] = useState(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem('mtg-dismissed-invites') || '[]')); }
    catch { return new Set(); }
  });

  const persistDismissed = (set) => {
    try { sessionStorage.setItem('mtg-dismissed-invites', JSON.stringify([...set])); } catch { /* ignore */ }
  };

  const reload = useCallback(async () => {
    if (!currentUser?.code) return;
    const { data, error } = await supabase.rpc('mtg_my_invites', { p_employee_id: currentUser.code });
    if (error) return;
    setInvites((data || []).filter((x) => x.status === 'invited'));
  }, [currentUser?.code]);

  useEffect(() => { reload(); }, [reload]);

  // Realtime: any insert on mtg_attendees for me -> re-fetch
  useEffect(() => {
    if (!currentUser?.code) return;
    const channel = supabase
      .channel(`mtg-my-invites-${currentUser.code}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mtg_attendees', filter: `employee_id=eq.${currentUser.code}` },
        () => reload(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'mtg_attendees', filter: `employee_id=eq.${currentUser.code}` },
        () => reload(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUser?.code, reload]);

  const visible = invites.filter((i) => !dismissedIds.has(i.booking_id));
  if (!visible.length) return null;

  const dismiss = (id) => {
    const next = new Set(dismissedIds);
    next.add(id);
    setDismissedIds(next);
    persistDismissed(next);
  };

  return (
    <div className="mtg-invite-bar">
      {visible.slice(0, 3).map((inv) => (
        <div key={inv.booking_id} className="mtg-invite-toast">
          <div className="mtg-invite-toast-icon">📩</div>
          <div className="mtg-invite-toast-body">
            <div className="mtg-invite-toast-title">คุณถูกเชิญเข้าประชุม</div>
            <div className="mtg-invite-toast-meta">
              <b>{inv.title}</b>
              <span> · {fmtDate(inv.booking_date)} {fmtTime(inv.start_min)}-{fmtTime(inv.end_min)}</span>
            </div>
            <div className="mtg-invite-toast-actions">
              <button className="btn-primary" onClick={() => { onOpenMeeting && onOpenMeeting(inv); }}>
                เปิดดู
              </button>
              <button className="btn-ghost" onClick={() => dismiss(inv.booking_id)}>
                ภายหลัง
              </button>
            </div>
          </div>
          <button className="mtg-invite-toast-x" onClick={() => dismiss(inv.booking_id)}>✕</button>
        </div>
      ))}
      {visible.length > 3 && (
        <div className="mtg-invite-more">+ อีก {visible.length - 3} คำเชิญ</div>
      )}
    </div>
  );
}
