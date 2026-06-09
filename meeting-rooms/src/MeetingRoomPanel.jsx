// MeetingRoomPanel — the "meeting window" that opens when a participant
// clicks "เข้าร่วมประชุม". Phase 1: attendee list + invite by employee_id +
// join / decline buttons. Future phases will add chat, files, and the
// post-meeting AI summary.
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from './lib/supabase.js';
import { fmtTimeColon } from './components.jsx';
import MeetingSummaryPanel from './MeetingSummaryPanel.jsx';

const THAI_MONTHS_LONG = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function normName(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

// Old rows may only have public_url; pull the path out of the URL.
function extractStoragePath(publicUrl) {
  if (!publicUrl) return null;
  const m = publicUrl.match(/\/object\/(?:public|sign)\/meeting-files\/(.+?)(?:\?|$)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function MeetingRoomPanel({ booking, room, currentUser, onClose, popout = false }) {
  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteIds, setInviteIds] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const [agenda, setAgenda] = useState([]);
  const [agendaDraft, setAgendaDraft] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [autoSummary, setAutoSummary] = useState(null);
  const [genBusy, setGenBusy] = useState(false);
  const [includeFiles, setIncludeFiles] = useState(true);

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

  // First time the booker opens their own meeting: ensure they're registered
  // as a joined attendee (so the count + invite UI + chat all light up).
  useEffect(() => {
    if (!booking?.id || !booking?.booker || !currentUser?.code || !currentUser?.name) return;
    if (normName(booking.booker) !== normName(currentUser.name)) return;
    supabase
      .rpc('mtg_ensure_booker_joined', {
        p_booking_id: booking.id,
        p_employee_id: currentUser.code,
      })
      .then(() => reload())
      .catch(() => { /* silent — non-fatal */ });
  }, [booking?.id, booking?.booker, currentUser?.code, currentUser?.name, reload]);

  // Refresh attachments + mint fresh signed URLs (1h validity) so leaked
  // links die quickly. Re-runs whenever the booking changes.
  const refreshAttachments = useCallback(async () => {
    if (!booking?.id) return;
    const { data } = await supabase.rpc('mtg_list_attachments', { p_booking_id: booking.id });
    const rows = data || [];
    const withSigned = await Promise.all(rows.map(async (a) => {
      try {
        // mtg_list_attachments returns public_url as the legacy field;
        // ignore it and mint a fresh signed URL from the storage_path we
        // also persisted. Newer rows don't even have public_url anymore.
        const path = a.storage_path || extractStoragePath(a.public_url);
        if (!path) return { ...a, signed_url: a.public_url || '' };
        const { data: signed } = await supabase.storage
          .from('meeting-files')
          .createSignedUrl(path, 3600);
        return { ...a, signed_url: signed?.signedUrl || '' };
      } catch {
        return { ...a, signed_url: '' };
      }
    }));
    setAttachments(withSigned);
  }, [booking?.id]);

  useEffect(() => {
    if (!booking?.id) return;
    setAgenda(Array.isArray(booking.agenda) ? booking.agenda : []);
    setAutoSummary(booking.autoSummary || null);
    refreshAttachments();
  }, [booking?.id, booking?.autoSummary, refreshAttachments]);

  // Track manual-end timestamp locally so "End meeting" button reflects
  // immediately (booking prop won't update without reloading).
  const [endedAt, setEndedAt] = useState(booking?.endedAt ? new Date(booking.endedAt) : null);
  useEffect(() => {
    setEndedAt(booking?.endedAt ? new Date(booking.endedAt) : null);
  }, [booking?.endedAt]);

  // Has the meeting ended? Either its scheduled end_min has passed, OR
  // the booker manually pressed "End meeting" (ended_at).
  const isPast = (() => {
    const nowMs = Date.now();
    if (endedAt && endedAt.getTime() <= nowMs) return true;
    if (!booking?.bookingDate || booking.end == null) return false;
    const d = new Date(booking.bookingDate);
    const endAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(),
                           Math.floor(booking.end / 60), booking.end % 60);
    return endAt.getTime() < nowMs;
  })();

  const endMeeting = async () => {
    if (!confirm('ปิดประชุมเดี๋ยวนี้? หลังจากนี้ส่ง chat / แก้ agenda / อัปโหลดไฟล์ ไม่ได้แล้ว')) return;
    try {
      const { data, error } = await supabase.rpc('mtg_end_meeting', {
        p_booking_id: booking.id,
        p_employee_id: currentUser.code,
      });
      if (error) throw error;
      setEndedAt(new Date(data || Date.now()));
      showToast('ปิดประชุมแล้ว — สามารถสร้างสรุป AI ได้เลย');
    } catch (err) {
      showToast(err.message || 'ปิดประชุมไม่สำเร็จ', 'err');
    }
  };

  const generateSummary = async () => {
    setGenBusy(true);
    try {
      const r = await fetch('/api/meeting-auto-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: booking.id, include_files: includeFiles }),
      });
      // Server may return HTML on crash/timeout — read as text first then
      // attempt JSON.parse so we surface a useful message either way.
      const raw = await r.text();
      let data;
      try { data = JSON.parse(raw); }
      catch {
        const snippet = raw.slice(0, 120).replace(/\s+/g, ' ');
        throw new Error(`เซิร์ฟเวอร์ตอบไม่ใช่ JSON (${r.status}): ${snippet}`);
      }
      if (!data.ok) throw new Error(data.error || 'สรุปไม่สำเร็จ');
      setAutoSummary(data.summary);
      showToast('สร้างสรุปสำเร็จ');
    } catch (err) {
      showToast(err.message || 'สรุปไม่สำเร็จ', 'err');
    } finally {
      setGenBusy(false);
    }
  };

  const persistAgenda = async (next) => {
    setAgenda(next);
    try {
      await supabase.rpc('mtg_update_agenda', {
        p_booking_id: booking.id,
        p_employee_id: currentUser.code,
        p_agenda: next,
      });
    } catch (err) {
      showToast(err.message || 'บันทึก agenda ไม่สำเร็จ', 'err');
    }
  };

  const addAgendaItem = () => {
    const text = agendaDraft.trim();
    if (!text) return;
    persistAgenda([...agenda, { id: Date.now(), text, done: false }]);
    setAgendaDraft('');
  };
  const toggleAgendaItem = (id) => {
    persistAgenda(agenda.map((it) => (it.id === id ? { ...it, done: !it.done } : it)));
  };
  const removeAgendaItem = (id) => {
    persistAgenda(agenda.filter((it) => it.id !== id));
  };

  const onFilePick = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser?.code) return;
    if (file.size > 25 * 1024 * 1024) {
      showToast('ไฟล์ใหญ่เกิน 25 MB', 'err');
      e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, '_');
      const path = `${booking.id}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from('meeting-files').upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      // Bucket is now private — we don't store a public URL anymore. The
      // client mints a fresh signed URL on each list (see refreshAttachments).
      const { error: rpcErr } = await supabase.rpc('mtg_add_attachment', {
        p_booking_id: booking.id,
        p_employee_id: currentUser.code,
        p_file_name: file.name,
        p_storage_path: path,
        p_public_url: null,
        p_mime_type: file.type || null,
        p_size_bytes: file.size,
      });
      if (rpcErr) throw rpcErr;
      await refreshAttachments();
      showToast(`อัปโหลด "${file.name}" แล้ว`);
    } catch (err) {
      showToast(err.message || 'อัปโหลดไม่สำเร็จ', 'err');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = async (att) => {
    if (!confirm(`ลบ "${att.file_name}"?`)) return;
    try {
      const { data: pathToDel, error } = await supabase.rpc('mtg_delete_attachment', {
        p_attachment_id: att.id,
        p_employee_id: currentUser.code,
      });
      if (error) throw error;
      if (pathToDel) {
        await supabase.storage.from('meeting-files').remove([pathToDel]);
      }
      setAttachments((list) => list.filter((x) => x.id !== att.id));
      showToast('ลบไฟล์แล้ว');
    } catch (err) {
      showToast(err.message || 'ลบไม่สำเร็จ', 'err');
    }
  };

  // Realtime: chat messages AND attendee status (so people don't see stale
  // "ยังไม่ตอบ" when someone in another tab just clicked "เข้าร่วม"). One
  // channel listens to both tables, both filtered to this booking.
  useEffect(() => {
    if (!booking?.id) return;
    let alive = true;

    (async () => {
      const { data, error } = await supabase.rpc('mtg_list_messages', { p_booking_id: booking.id });
      if (alive && !error) setMessages(data || []);
    })();

    const channel = supabase
      .channel(`mtg-room-${booking.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mtg_messages', filter: `booking_id=eq.${booking.id}` },
        async () => {
          const { data } = await supabase.rpc('mtg_list_messages', { p_booking_id: booking.id });
          if (alive) setMessages(data || []);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mtg_attendees', filter: `booking_id=eq.${booking.id}` },
        () => { if (alive) reload(); },
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [booking?.id, reload]);

  // Auto-scroll to the newest message
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length]);

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

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || !currentUser?.code) return;
    setSending(true);
    try {
      const { error } = await supabase.rpc('mtg_post_message', {
        p_booking_id: booking.id,
        p_employee_id: currentUser.code,
        p_body: text,
      });
      if (error) throw error;
      setDraft('');
      // Realtime subscription will refresh the list — no manual fetch needed
    } catch (err) {
      showToast(err.message || 'ส่งข้อความไม่สำเร็จ', 'err');
    } finally {
      setSending(false);
    }
  };

  const kickAttendee = async (att) => {
    const label = att.first_name ? `${att.first_name} ${att.last_name || ''}`.trim() : att.employee_id;
    if (!confirm(`เอาออก ${label} จากประชุมนี้?`)) return;
    try {
      const { error } = await supabase.rpc('mtg_remove_attendee', {
        p_booking_id: booking.id,
        p_target_id: att.employee_id,
        p_requester_id: currentUser.code,
      });
      if (error) throw error;
      showToast(`เอา ${label} ออกแล้ว`);
      reload();
    } catch (err) {
      showToast(err.message || 'เอาออกไม่สำเร็จ', 'err');
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

  const wrapperProps = popout
    ? { className: 'mtg-room-popout' }
    : { className: 'mtg-room-backdrop', onClick: onClose };
  const panelProps = popout
    ? { className: 'mtg-room-panel mtg-room-panel-popout' }
    : { className: 'mtg-room-panel', onClick: (e) => e.stopPropagation() };

  return (
    <div {...wrapperProps}>
      <div {...panelProps}>
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

        {isPast && (
          <div className="mtg-past-banner">
            ⏱ <b>ประชุมจบแล้ว</b>
            {endedAt && <span> · ปิดเอง {endedAt.getHours().toString().padStart(2, '0')}:{endedAt.getMinutes().toString().padStart(2, '0')}</span>}
             — ข้อมูลจะเก็บไว้ <b>2 อาทิตย์</b>
          </div>
        )}

        {isBooker && !isPast && (
          <div className="mtg-end-row">
            <button className="mtg-end-btn" onClick={endMeeting}>
              🛑 จบประชุมเดี๋ยวนี้
            </button>
            <span className="mtg-end-hint">
              ตอนนี้ประชุมจะจบอัตโนมัติเวลา {String(Math.floor(booking.end / 60)).padStart(2, '0')}:{String(booking.end % 60).padStart(2, '0')}
              — กดเพื่อปิดก่อน
            </span>
          </div>
        )}

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
                // Pick first NON-whitespace character so trailing-space nicknames
                // don't render an invisible avatar.
                const seedRaw = [a.nickname, a.first_name, a.employee_id, '?']
                  .map((s) => (s || '').trim())
                  .find(Boolean) || '?';
                const initial = seedRaw.charAt(0).toUpperCase();
                // Booker can kick anyone except themselves. Comparison
                // by employee_id is safer than name normalization.
                const canKick = isBooker && a.employee_id !== currentUser?.code;
                return (
                  <li key={a.employee_id} className={`mtg-attendee mtg-attendee-${a.status}`}>
                    <div className="mtg-attendee-avatar">{initial}</div>
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
                    {canKick && (
                      <button
                        type="button"
                        className="mtg-kick-btn"
                        onClick={() => kickAttendee(a)}
                        title="เตะออกจากประชุม"
                        aria-label="เตะออก"
                      >
                        ✕
                      </button>
                    )}
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

        {/* Audio recording + AI summary have been moved to the booking
            history drawer (ประวัติการจอง). The meeting room is now purely
            for live collaboration — chat / agenda / files / invite. */}

        {/* Auto AI summary (Phase 4) — show after meeting ends, only to
            booker / joined attendees (others don't see private summaries).
            DISABLED in meeting room — moved to history drawer. */}
        {false && isPast && isJoined && (
          <section className="mtg-room-section mtg-auto-summary">
            <div className="mtg-room-section-head">
              🤖 สรุปการประชุม (AI)
              {autoSummary && <span className="mtg-chat-count">สร้างแล้ว</span>}
            </div>
            {autoSummary ? (
              <div className="mtg-summary-card">
                {autoSummary.tldr && (
                  <div className="mtg-summary-tldr">
                    <span className="mtg-summary-label">TL;DR</span>
                    <span>{autoSummary.tldr}</span>
                  </div>
                )}
                {autoSummary.key_points?.length > 0 && (
                  <div className="mtg-summary-block">
                    <div className="mtg-summary-label">ประเด็นสำคัญ</div>
                    <ul>{autoSummary.key_points.map((p, i) => <li key={i}>{p}</li>)}</ul>
                  </div>
                )}
                {autoSummary.decisions?.length > 0 && (
                  <div className="mtg-summary-block">
                    <div className="mtg-summary-label">ข้อตัดสินใจ</div>
                    <ul>{autoSummary.decisions.map((p, i) => <li key={i}>{p}</li>)}</ul>
                  </div>
                )}
                {autoSummary.action_items?.length > 0 && (
                  <div className="mtg-summary-block">
                    <div className="mtg-summary-label">Action Items</div>
                    <ul>
                      {autoSummary.action_items.map((a, i) => (
                        <li key={i}>
                          {a.task}
                          {a.owner && <span className="mtg-owner"> · {a.owner}</span>}
                          {a.due && <span className="mtg-due"> · กำหนด {a.due}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {autoSummary.next_steps?.length > 0 && (
                  <div className="mtg-summary-block">
                    <div className="mtg-summary-label">ขั้นถัดไป</div>
                    <ul>{autoSummary.next_steps.map((p, i) => <li key={i}>{p}</li>)}</ul>
                  </div>
                )}
                <div className="mtg-summary-files-used">
                  <span style={{ marginRight: 6 }}>📥 แหล่งข้อมูลที่ใช้:</span>
                  <span className="mtg-file-used mtg-file-ok">agenda + chat + meta</span>
                  {autoSummary._used_audio && (
                    <span className="mtg-file-used mtg-file-ok">🎙️ transcript เสียง</span>
                  )}
                  {autoSummary._files && autoSummary._files.map((f, i) => (
                    <span key={i} className={`mtg-file-used mtg-file-${f.status === 'ok' || f.status === 'truncated' ? 'ok' : 'skip'}`}>
                      {f.file_name}
                      {f.status === 'truncated' && ' (ตัดท้าย)'}
                      {f.status === 'no-text' && ' (อ่านไม่ได้)'}
                    </span>
                  ))}
                </div>
                <div className="mtg-summary-actions">
                  <button className="btn-ghost" onClick={generateSummary} disabled={genBusy}>
                    🔄 สร้างใหม่
                  </button>
                </div>
              </div>
            ) : (
              <div className="mtg-summary-empty">
                <p>กดเพื่อให้ AI สรุปจาก<b>ทุกข้อมูลในหน้านี้</b> — meta · ผู้เข้าร่วม · agenda · แชท{attachments.length > 0 ? ` · ไฟล์แนบ ${attachments.length} ไฟล์` : ''} · transcript เสียง (ถ้ามี)</p>
                {attachments.length > 0 && (
                  <label className="mtg-summary-toggle">
                    <input
                      type="checkbox"
                      checked={includeFiles}
                      onChange={(e) => setIncludeFiles(e.target.checked)}
                    />
                    <span>รวมเนื้อหาไฟล์แนบ ({attachments.length} ไฟล์) เข้าไปด้วย</span>
                  </label>
                )}
                <button className="btn-primary" onClick={generateSummary} disabled={genBusy}>
                  {genBusy ? 'กำลังสรุป...' : '✨ สร้างสรุป AI'}
                </button>
                <div className="mtg-summary-quota">
                  ℹ️ ใช้ Gemini Flash (ฟรี) · จำกัด 15 ครั้ง/นาที · <b>1,500 ครั้ง/วัน</b>
                  ทั้งบริษัท (เผื่อ 50× ของการใช้ปัจจุบัน)
                </div>
              </div>
            )}
          </section>
        )}

        {/* Agenda section removed per user request — file attachments +
            chat are enough for tracking what was discussed. */}

        {/* Files (Phase 3) */}
        {(attachments.length > 0 || isJoined) && (
          <section className="mtg-room-section">
            <div className="mtg-room-section-head">
              📎 ไฟล์แนบ
              <span className="mtg-chat-count">{attachments.length}</span>
            </div>
            {attachments.length === 0 ? (
              <div className="mtg-room-empty">ยังไม่มีไฟล์ — อัปโหลดได้ด้านล่าง (สูงสุด 25 MB)</div>
            ) : (
              <ul className="mtg-files-list">
                {attachments.map((a) => (
                  <li key={a.id} className="mtg-file-item">
                    <span className="mtg-file-icon">📄</span>
                    <a
                      className="mtg-file-link"
                      href={a.signed_url || a.public_url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      title="ลิงก์หมดอายุใน 1 ชั่วโมง — ถ้าโหลดไม่ได้ refresh หน้าใหม่"
                    >
                      {a.file_name}
                    </a>
                    <span className="mtg-file-meta">
                      {a.size_bytes ? `${(a.size_bytes / 1024).toFixed(0)} KB · ` : ''}{a.uploader_name}
                    </span>
                    {a.uploaded_by === currentUser?.code && !isPast && (
                      <button className="mtg-agenda-x" onClick={() => removeAttachment(a)} title="ลบ">×</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {isJoined && !isPast && (
              <div className="mtg-file-upload">
                <input
                  ref={fileInputRef}
                  type="file" id="mtg-file-pick"
                  style={{ display: 'none' }}
                  onChange={onFilePick}
                  disabled={uploading}
                />
                <label htmlFor="mtg-file-pick" className={`btn-primary ${uploading ? 'is-busy' : ''}`} style={{ cursor: 'pointer', display: 'inline-block' }}>
                  {uploading ? 'กำลังอัปโหลด...' : '⬆ เลือกไฟล์'}
                </label>
              </div>
            )}
          </section>
        )}

        {/* Chat section removed per user request — meeting window is purely
            attendee list + file attachments now. The mtg_messages table and
            realtime subscription stay in place in case we re-enable later. */}

        {toast && (
          <div className={`mtg-room-toast mtg-room-toast--${toast.kind}`}>{toast.msg}</div>
        )}
      </div>
    </div>
  );
}
