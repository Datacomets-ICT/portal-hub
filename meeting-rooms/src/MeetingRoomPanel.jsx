// MeetingRoomPanel — the "meeting window" that opens when a participant
// clicks "เข้าร่วมประชุม". Phase 1: attendee list + invite by employee_id +
// join / decline buttons. Future phases will add chat, files, and the
// post-meeting AI summary.
import { useEffect, useState, useCallback } from 'react';
import { supabase } from './lib/supabase.js';
import { fmtTimeColon } from './components.jsx';

const THAI_MONTHS_LONG = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function normName(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

export default function MeetingRoomPanel({ booking, room, currentUser, onClose }) {
  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteIds, setInviteIds] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, kind = 'ok') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2800);
  };

  const reload = useCallback(async () => {
    if (!booking?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('mtg_list_attendees', { p_booking_id: booking.id });
      if (error) throw error;
      setAttendees(data || []);
    } catch (err) {
      showToast(err.message || 'โหลดรายชื่อไม่สำเร็จ', 'err');
    } finally {
      setLoading(false);
    }
  }, [booking?.id]);

  useEffect(() => { reload(); }, [reload]);

  const myRow = attendees.find((a) => a.employee_id === currentUser?.code);
  const isBooker = currentUser?.name && normName(booking?.booker) === normName(currentUser.name);
  const isJoined = myRow?.status === 'joined' || isBooker;
  const canInvite = isJoined; // booker or any joined attendee can invite more

  const joinedCount   = attendees.filter((a) => a.status === 'joined').length + (isBooker && !attendees.some((a) => a.employee_id === currentUser?.code) ? 1 : 0);
  const invitedCount  = attendees.filter((a) => a.status === 'invited').length;
  const declinedCount = attendees.filter((a) => a.status === 'declined').length;

  const handleInvite = async () => {
    const ids = inviteIds
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!ids.length) {
      showToast('ใส่รหัสพนักงานที่จะเชิญ', 'err');
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('mtg_invite_attendees', {
        p_booking_id: booking.id,
        p_inviter_id: currentUser.code,
        p_invitee_ids: ids,
      });
      if (error) throw error;
      const added   = data?.added   ?? 0;
      const skipped = data?.skipped ?? 0;
      showToast(`เชิญ ${added} คน${skipped ? ` (ข้าม ${skipped})` : ''}`);
      setInviteIds('');
      reload();
    } catch (err) {
      showToast(err.message || 'เชิญไม่สำเร็จ', 'err');
    } finally {
      setBusy(false);
    }
  };

  const setMyStatus = async (status) => {
    if (!currentUser?.code) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('mtg_set_attendance', {
        p_booking_id: booking.id,
        p_employee_id: currentUser.code,
        p_status: status,
      });
      if (error) throw error;
      showToast(status === 'joined' ? 'เข้าร่วมแล้ว' : 'ปฏิเสธแล้ว');
      reload();
    } catch (err) {
      showToast(err.message || 'อัปเดตไม่สำเร็จ', 'err');
    } finally {
      setBusy(false);
    }
  };

  if (!booking || !room) return null;
  const date = booking.bookingDate ? new Date(booking.bookingDate) : null;
  const dateLabel = date
    ? `${date.getDate()} ${THAI_MONTHS_LONG[date.getMonth()]} ${date.getFullYear() + 543}`
    : '';

  return (
    <div className="mtg-room-backdrop" onClick={onClose}>
      <div className="mtg-room-panel" onClick={(e) => e.stopPropagation()}>
        <header className="mtg-room-head">
          <div>
            <div className="mtg-room-kicker">🎯 หน้าต่างประชุม</div>
            <h2 className="mtg-room-title">{booking.title || 'การประชุม'}</h2>
            <div className="mtg-room-meta">
              <span>{room.name} ({room.id})</span>
              <span>·</span>
              <span>{dateLabel}</span>
              <span>·</span>
              <span className="mono">{fmtTimeColon(booking.start)}–{fmtTimeColon(booking.end)}</span>
            </div>
            <div className="mtg-room-booker">ผู้จัด: {booking.booker || '—'}</div>
          </div>
          <button className="mtg-room-close" onClick={onClose}>✕</button>
        </header>

        <div className="mtg-room-stats">
          <div className="mtg-stat mtg-stat-ok">
            <span className="mtg-stat-num">{joinedCount}</span>
            <span className="mtg-stat-lbl">เข้าร่วม</span>
          </div>
          <div className="mtg-stat mtg-stat-warn">
            <span className="mtg-stat-num">{invitedCount}</span>
            <span className="mtg-stat-lbl">ยังไม่ตอบ</span>
          </div>
          <div className="mtg-stat mtg-stat-mute">
            <span className="mtg-stat-num">{declinedCount}</span>
            <span className="mtg-stat-lbl">ปฏิเสธ</span>
          </div>
        </div>

        {/* Current user's join/decline buttons (only if invited and not booker) */}
        {myRow && !isBooker && myRow.status === 'invited' && (
          <div className="mtg-rsvp">
            <div className="mtg-rsvp-prompt">คุณถูกเชิญมาที่ประชุมนี้</div>
            <div className="mtg-rsvp-buttons">
              <button className="btn-primary" disabled={busy} onClick={() => setMyStatus('joined')}>✓ เข้าร่วม</button>
              <button className="btn-ghost"   disabled={busy} onClick={() => setMyStatus('declined')}>✗ ปฏิเสธ</button>
            </div>
          </div>
        )}
        {myRow && !isBooker && myRow.status === 'joined' && (
          <div className="mtg-rsvp mtg-rsvp-confirmed">✓ คุณยืนยันเข้าร่วมแล้ว</div>
        )}
        {myRow && !isBooker && myRow.status === 'declined' && (
          <div className="mtg-rsvp mtg-rsvp-declined">✗ คุณปฏิเสธการเข้าร่วม</div>
        )}

        {/* Attendee list */}
        <section className="mtg-room-section">
          <div className="mtg-room-section-head">รายชื่อผู้เข้าร่วม</div>
          {loading ? (
            <div className="mtg-room-empty">กำลังโหลด…</div>
          ) : attendees.length === 0 ? (
            <div className="mtg-room-empty">ยังไม่มีผู้ถูกเชิญ — กด "เชิญเพิ่ม" ด้านล่าง</div>
          ) : (
            <ul className="mtg-attendee-list">
              {attendees.map((a) => {
                const fullName = [a.first_name, a.last_name].filter(Boolean).join(' ') || a.employee_id;
                const sub = [a.position, a.department].filter(Boolean).join(' · ');
                return (
                  <li key={a.employee_id} className={`mtg-attendee mtg-attendee-${a.status}`}>
                    <div className="mtg-attendee-avatar">{(a.nickname || a.first_name || a.employee_id || '?').charAt(0).toUpperCase()}</div>
                    <div className="mtg-attendee-info">
                      <div className="mtg-attendee-name">
                        {fullName}
                        {a.nickname && <span className="mtg-attendee-nick"> ({a.nickname})</span>}
                      </div>
                      {sub && <div className="mtg-attendee-sub">{sub}</div>}
                    </div>
                    <span className={`mtg-status-pill mtg-status-${a.status}`}>
                      {a.status === 'joined' ? 'เข้าร่วม' : a.status === 'declined' ? 'ปฏิเสธ' : 'รอตอบ'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Invite by employee_id */}
        {canInvite && (
          <section className="mtg-room-section">
            <div className="mtg-room-section-head">เชิญเพิ่ม</div>
            <div className="mtg-invite-row">
              <input
                className="mtg-invite-input"
                placeholder="ใส่รหัสพนักงาน (คั่นด้วย , หรือเว้นวรรค) เช่น 11295, 10001"
                value={inviteIds}
                onChange={(e) => setInviteIds(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleInvite(); }}
                disabled={busy}
              />
              <button className="btn-primary" onClick={handleInvite} disabled={busy || !inviteIds.trim()}>
                ➕ เชิญ
              </button>
            </div>
            <div className="mtg-invite-hint">
              พิมพ์รหัสพนักงาน (employee_id) ที่จะเชิญ คั่นด้วย comma หรือ space
            </div>
          </section>
        )}

        {toast && (
          <div className={`mtg-room-toast mtg-room-toast--${toast.kind}`}>{toast.msg}</div>
        )}
      </div>
    </div>
  );
}
