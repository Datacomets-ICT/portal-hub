import { useEffect, useRef, useState } from 'react';

// Lightweight modal for "send meeting summary as email".
// To / CC accept comma- or newline-separated lists. The actual
// HTML body is generated server-side from the note row, so all the
// modal needs to collect is recipients, optional custom subject,
// and an optional intro paragraph.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function splitEmails(s) {
  if (!s) return [];
  return String(s).split(/[,;\n]+/).map(e => e.trim()).filter(Boolean);
}

export default function MeetingEmailModal({ open, onClose, note, booking, defaultTo = '', defaultSubject = '' }) {
  const [to, setTo]           = useState(defaultTo);
  const [cc, setCc]           = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr]         = useState('');
  const [okMsg, setOkMsg]     = useState('');
  const toRef = useRef(null);

  useEffect(() => {
    if (open) {
      setTo(defaultTo);
      setCc('');
      setSubject(defaultSubject);
      setMessage('');
      setErr('');
      setOkMsg('');
      setTimeout(() => toRef.current?.focus(), 50);
    }
  }, [open, defaultTo, defaultSubject]);

  if (!open) return null;

  const toList = splitEmails(to);
  const ccList = splitEmails(cc);
  const toBad = toList.filter(e => !EMAIL_RE.test(e));
  const ccBad = ccList.filter(e => !EMAIL_RE.test(e));
  const canSend = toList.length > 0 && toBad.length === 0 && ccBad.length === 0 && !sending && !!note?.id;

  async function handleSend() {
    if (!canSend) return;
    setErr('');
    setOkMsg('');
    setSending(true);
    try {
      const r = await fetch('/api/meeting-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note_id: note.id,
          to: toList,
          cc: ccList,
          subject: subject?.trim() || undefined,
          message: message?.trim() || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      setOkMsg(`✅ ส่งสำเร็จ — ถึง ${toList.length} คน${ccList.length ? `, CC ${ccList.length}` : ''}`);
      setTimeout(() => onClose(), 1500);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !sending && onClose()}>
      <div
        className="modal modal-email"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '560px', maxWidth: '95%' }}
      >
        <div className="modal-head" style={{ background: 'linear-gradient(135deg,#1E3A8A 0%,#1E40AF 50%,#0F172A 100%)', color: '#fff', padding: '20px 24px' }}>
          <div className="modal-kicker" style={{ fontSize: '11px', letterSpacing: '2px', opacity: 0.9, textTransform: 'uppercase', fontWeight: 600 }}>
            ส่งสรุปการประชุมทาง Email
          </div>
          <div className="modal-room-name" style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px' }}>
            📧 {booking?.title || 'สรุปการประชุม'}
          </div>
          <button className="modal-close" onClick={onClose} disabled={sending}>✕</button>
        </div>

        <div className="modal-body" style={{ padding: '20px 24px' }}>
          <label className="field field-full">
            <span className="field-label">ส่งถึง (To) <span style={{ color: '#DC2626' }}>*</span></span>
            <textarea
              ref={toRef}
              className="field-input"
              rows={2}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="email1@example.com, email2@example.com"
              style={{ fontFamily: 'inherit', resize: 'vertical' }}
              disabled={sending}
            />
            <small style={{ color: '#6B7280', fontSize: '11px', marginTop: '4px', display: 'block' }}>
              คั่นด้วย "," หรือขึ้นบรรทัดใหม่
              {toBad.length > 0 && <span style={{ color: '#DC2626', marginLeft: '8px' }}> · ❌ ผิดรูปแบบ: {toBad.join(', ')}</span>}
            </small>
          </label>

          <label className="field field-full">
            <span className="field-label">สำเนา (CC) — ไม่บังคับ</span>
            <textarea
              className="field-input"
              rows={2}
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="cc1@example.com, cc2@example.com"
              style={{ fontFamily: 'inherit', resize: 'vertical' }}
              disabled={sending}
            />
            {ccBad.length > 0 && <small style={{ color: '#DC2626', fontSize: '11px' }}>❌ ผิดรูปแบบ: {ccBad.join(', ')}</small>}
          </label>

          <label className="field field-full">
            <span className="field-label">หัวข้อ</span>
            <input
              type="text"
              className="field-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={defaultSubject}
              disabled={sending}
            />
          </label>

          <label className="field field-full">
            <span className="field-label">ข้อความเปิด — ไม่บังคับ</span>
            <textarea
              className="field-input"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="เช่น เรียนทุกท่าน — ขอส่งสรุปการประชุมเมื่อสักครู่นี้นะครับ..."
              style={{ fontFamily: 'inherit', resize: 'vertical' }}
              disabled={sending}
            />
          </label>

          {err && (
            <div className="ms-error" style={{ marginTop: '12px' }}>
              ❌ {err}
            </div>
          )}
          {okMsg && (
            <div style={{ marginTop: '12px', padding: '8px 12px', background: '#DCFCE7', color: '#14532D', borderRadius: '6px', fontSize: '13px' }}>
              {okMsg}
            </div>
          )}
        </div>

        <div className="modal-foot" style={{ padding: '14px 24px', borderTop: '1px solid var(--line)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose} disabled={sending}>ยกเลิก</button>
          <button className="btn-primary" onClick={handleSend} disabled={!canSend}>
            {sending ? '⏳ กำลังส่ง...' : '📨 ส่ง Email'}
          </button>
        </div>
      </div>
    </div>
  );
}
