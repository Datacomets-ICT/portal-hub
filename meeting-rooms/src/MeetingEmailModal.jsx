import { useEffect, useRef, useState } from 'react';

// "Draft email" modal — gathers recipients + subject + intro, shows a
// live HTML preview of the email body, then hands the draft off to the
// user's actual mail client (Gmail web, default mail app, etc).
//
// Why no SMTP send by default: the original "send via Gmail SMTP" path
// requires an app password that's easy to mis-configure (and was). Drafting
// instead means:
//   - no server credentials to manage
//   - the sender's real identity / signature comes through Gmail / Outlook
//   - user can review + edit one more time before hitting Send
//
// Three handoff options:
//   📧 ร่างใน Outlook (เดสก์ท็อป) — mailto: opens the installed Outlook / default
//        mail app (editable, sendable) AND copies the formatted HTML to the
//        clipboard so the user can Ctrl+V the tables/colours over the plain body
//   🌐 Outlook เว็บ — opens outlook.office.com compose (Office 365 / Outlook.com)
//   📋 คัดลอก HTML — copies the formatted body to clipboard for any mail client
//
// The legacy SMTP "ส่งจากระบบ" path stays as a fallback in case credentials
// are eventually set up.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function splitEmails(s) {
  if (!s) return [];
  return String(s).split(/[,;\n]+/).map((e) => e.trim()).filter(Boolean);
}

// Plain-text body for mailto: / Gmail compose URL. URLs have a length cap
// (~2000 chars in Outlook, more in modern browsers) so we keep this tight.
function buildPlainBody({ summary, booking, message, signature }) {
  const lines = [];
  if (message?.trim()) {
    lines.push(message.trim());
    lines.push('');
  }
  lines.push(`สรุปการประชุม: ${booking?.title || ''}`);
  if (booking?.booking_date) lines.push(`วันที่: ${booking.booking_date}`);
  if (booking?.start_min != null && booking?.end_min != null) {
    const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    lines.push(`เวลา: ${fmt(booking.start_min)}-${fmt(booking.end_min)}`);
  }
  if (booking?.booker) lines.push(`ผู้จัด: ${booking.booker}`);
  lines.push('');

  if (summary?.tldr) {
    lines.push('[ สรุปย่อ ]');
    lines.push(summary.tldr);
    lines.push('');
  }

  const topics = summary?.topics_discussed?.length ? summary.topics_discussed : (summary?.key_points || []);
  if (topics.length) {
    lines.push('[ หัวข้อหลักที่หารือ ]');
    topics.forEach((t) => lines.push(`- ${t}`));
    lines.push('');
  }

  if (summary?.decisions?.length) {
    lines.push('[ มติที่ประชุม / ข้อตัดสินใจ ]');
    summary.decisions.forEach((d) => lines.push(`- ${d}`));
    lines.push('');
  }

  if (summary?.action_items?.length) {
    lines.push('[ สิ่งที่ต้องทำต่อ (Action Items) ]');
    summary.action_items.forEach((a, i) => {
      lines.push(`${i + 1}. ${a.task || ''}`);
      const meta = [];
      if (a.owner) meta.push(`ผู้รับผิดชอบ: ${a.owner}`);
      if (a.due)   meta.push(`กำหนด: ${a.due}`);
      if (meta.length) lines.push(`   (${meta.join(' · ')})`);
    });
    lines.push('');
  }

  const pending = summary?.pending_items?.length ? summary.pending_items : (summary?.next_steps || []);
  if (pending.length) {
    lines.push('[ ประเด็นค้างคา / ต้องตัดสินใจต่อ ]');
    pending.forEach((p) => lines.push(`- ${p}`));
    lines.push('');
  }

  if (signature) {
    lines.push('--');
    lines.push(signature);
  }

  return lines.join('\n');
}

// Signature plain-text from currentUser (mirrors what the HTML signature
// renders server-side, but plain). Used only for the draft handoffs since
// SMTP-server signature is built in the API.
function plainSignature(user) {
  if (!user) return '';
  const lines = [];
  const fullName = user.name || '';
  const nick = user.nickname || '';
  if (fullName) lines.push(nick ? `${fullName} (${nick})` : fullName);
  if (user.position) lines.push(user.position);
  lines.push(user.company || 'Comets Intertrade Co., Ltd.');
  if (user.phone) lines.push(`Mobile : ${user.phone}`);
  if (user.email) lines.push(`email  : ${user.email}`);
  return lines.join('\n');
}

export default function MeetingEmailModal({
  open, onClose, note, booking, summary, currentUser = null,
  defaultTo = '', defaultSubject = '',
}) {
  const [to, setTo]           = useState(defaultTo);
  const [cc, setCc]           = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState('');
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState('');
  const [okMsg, setOkMsg]     = useState('');

  // Live HTML preview — fetched from the API in preview mode so what the
  // user sees here IS exactly what the API would send (signature included).
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const toRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setTo(defaultTo);
    setCc('');
    setSubject(defaultSubject);
    setMessage('');
    setErr('');
    setOkMsg('');
    setTimeout(() => toRef.current?.focus(), 50);
  }, [open, defaultTo, defaultSubject]);

  // Fetch live preview when modal opens — the API renders the same HTML
  // for both preview and send, so this also doubles as a sanity check
  // that the server can actually generate the body.
  useEffect(() => {
    if (!open) return;
    const bookingId = booking?.id;
    const noteId    = note?.id;
    if (!bookingId && !noteId) return;
    setPreviewBusy(true);
    setPreviewHtml('');
    fetch('/api/meeting-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        booking_id:    bookingId,
        note_id:       noteId,
        sender_emp_id: currentUser?.code || currentUser?.employeeId,
        message:       message?.trim() || undefined,
        subject:       subject?.trim() || undefined,
        preview:       true,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setPreviewHtml(d.html || '');
        else setErr(d.error || 'preview ล้มเหลว');
      })
      .catch((e) => setErr(String(e.message || e)))
      .finally(() => setPreviewBusy(false));
  }, [open, booking?.id, note?.id, currentUser?.code, currentUser?.employeeId, message, subject]);

  if (!open) return null;

  const toList = splitEmails(to);
  const ccList = splitEmails(cc);
  const toBad  = toList.filter((e) => !EMAIL_RE.test(e));
  const ccBad  = ccList.filter((e) => !EMAIL_RE.test(e));
  const hasSource    = !!note?.id || !!booking?.id;
  const recipientsOk = toList.length > 0 && toBad.length === 0 && ccBad.length === 0;

  const draftDataReady = hasSource && !!summary;

  // Helpers used by the draft buttons
  const buildPayload = () => buildPlainBody({
    summary,
    booking,
    message: message?.trim(),
    signature: plainSignature(currentUser),
  });

  const finalSubject = (subject?.trim() || defaultSubject || 'สรุปการประชุม').trim();

  const openInOutlook = () => {
    // Build the query with encodeURIComponent (space → %20). URLSearchParams
    // encodes space as "+", which mail clients show literally instead of a space.
    const parts = [
      `to=${encodeURIComponent(toList.join(','))}`,
      `subject=${encodeURIComponent(finalSubject)}`,
      `body=${encodeURIComponent(buildPayload())}`,
    ];
    if (ccList.length) parts.push(`cc=${encodeURIComponent(ccList.join(','))}`);
    const url = `https://outlook.office.com/mail/deeplink/compose?${parts.join('&')}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setOkMsg('📧 เปิด Outlook แล้ว — กลับไปกด "Send" ใน Outlook');
  };

  // Open the locally-installed Outlook (or whatever the OS default mail app is)
  // via mailto: — this pops an editable, sendable compose window straight on the
  // desktop. mailto can only carry PLAIN text, so we ALSO copy the fully
  // formatted HTML to the clipboard; the user hits Ctrl+V in the new draft to
  // paste the tables/colours over the plain body. One click + one paste.
  const draftInOutlookDesktop = async () => {
    let copied = false;
    if (previewHtml) {
      try {
        if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
          await navigator.clipboard.write([
            new ClipboardItem({ 'text/html': new Blob([previewHtml], { type: 'text/html' }) }),
          ]);
        } else {
          await navigator.clipboard.writeText(previewHtml);
        }
        copied = true;
      } catch { /* clipboard blocked — the plain mailto body still carries the summary */ }
    }
    // encodeURIComponent → space becomes %20 (Outlook decodes it to a real
    // space). URLSearchParams would use "+", which Outlook shows literally.
    const parts = [
      `subject=${encodeURIComponent(finalSubject)}`,
      `body=${encodeURIComponent(buildPayload())}`,
    ];
    if (ccList.length) parts.push(`cc=${encodeURIComponent(ccList.join(','))}`);
    window.location.href = `mailto:${toList.join(',')}?${parts.join('&')}`;
    setOkMsg(copied
      ? '📧 เปิด Outlook เดสก์ท็อปแล้ว — เนื้อหาแบบมีรูปแบบ (ตาราง/สี) คัดลอกไว้ให้แล้ว กด Ctrl+V ในอีเมลเพื่อวางทับได้'
      : '📧 เปิด Outlook เดสก์ท็อปแล้ว');
  };

  const copyHtml = async () => {
    if (!previewHtml) return;
    try {
      // Prefer ClipboardItem (preserves HTML formatting when pasted into Gmail/Outlook)
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        const blob = new Blob([previewHtml], { type: 'text/html' });
        const data = [new ClipboardItem({ 'text/html': blob })];
        await navigator.clipboard.write(data);
      } else {
        await navigator.clipboard.writeText(previewHtml);
      }
      setOkMsg('📋 คัดลอกเนื้อหา HTML แล้ว — paste ในกล่องเขียนเมลได้เลย');
    } catch (e) {
      setErr('คัดลอกไม่สำเร็จ — ' + (e.message || e));
    }
  };

  const sendViaSmtp = async () => {
    if (!recipientsOk) return;
    setErr('');
    setOkMsg('');
    setBusy(true);
    try {
      const payload = {
        to: toList,
        cc: ccList,
        subject: subject?.trim() || undefined,
        message: message?.trim() || undefined,
        sender_emp_id: currentUser?.code || currentUser?.employeeId || undefined,
      };
      if (note?.id)         payload.note_id    = note.id;
      else if (booking?.id) payload.booking_id = booking.id;

      const r = await fetch('/api/meeting-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      setOkMsg(`✅ ส่งจากระบบสำเร็จ — ถึง ${toList.length} คน${ccList.length ? `, CC ${ccList.length}` : ''}`);
      setTimeout(() => onClose(), 1500);
    } catch (e) {
      setErr(`ส่งจากระบบไม่สำเร็จ: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div
        className="modal email-draft-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head" style={{
          background: 'linear-gradient(135deg,#1E3A8A 0%,#1E40AF 50%,#0F172A 100%)',
          color: '#fff', padding: '16px 22px',
        }}>
          <div style={{ fontSize: '11px', letterSpacing: '2px', opacity: 0.9, textTransform: 'uppercase', fontWeight: 600 }}>
            ร่างอีเมลสรุปการประชุม
          </div>
          <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '2px' }}>
            📝 {booking?.title || 'สรุปการประชุม'}
          </div>
          <button className="modal-close" onClick={onClose} disabled={busy}>✕</button>
        </div>

        <div className="email-draft-split">
          {/* LEFT — form */}
          <div className="email-draft-form">
            <label className="field field-full">
              <span className="field-label">ส่งถึง (To) <span style={{ color: '#DC2626' }}>*</span></span>
              <textarea
                ref={toRef}
                className="field-input"
                rows={2}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="email1@example.com, email2@example.com"
                disabled={busy}
              />
              <small style={{ color: '#6B7280', fontSize: '11px', display: 'block', marginTop: 4 }}>
                คั่นด้วย "," หรือขึ้นบรรทัดใหม่
                {toBad.length > 0 && <span style={{ color: '#DC2626', marginLeft: 8 }}>❌ ผิดรูปแบบ: {toBad.join(', ')}</span>}
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
                disabled={busy}
              />
              {ccBad.length > 0 && <small style={{ color: '#DC2626', fontSize: 11 }}>❌ ผิดรูปแบบ: {ccBad.join(', ')}</small>}
            </label>

            <label className="field field-full">
              <span className="field-label">หัวข้อ</span>
              <input
                type="text"
                className="field-input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={defaultSubject}
                disabled={busy}
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
                disabled={busy}
              />
            </label>

            <div className="email-draft-howto">
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6, color: 'var(--fg-2)' }}>
                วิธีร่างเมล — แนะนำ "ร่างใน Outlook (เดสก์ท็อป)"
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--fg-3)', lineHeight: 1.65 }}>
                <li><b>📧 ร่างใน Outlook (เดสก์ท็อป)</b> — เปิด Outlook ในเครื่องทันที พร้อมผู้รับ/หัวข้อ/เนื้อหา (ข้อความล้วน) และคัดลอกเนื้อหารูปแบบเต็ม (ตาราง/สี) ไว้ให้ — กด <b>Ctrl+V</b> ในอีเมลเพื่อวางแบบสวย</li>
                <li><b>🌐 Outlook เว็บ</b> — เปิดร่างบน Outlook web (Office 365 / Outlook.com)</li>
                <li><b>📋 คัดลอก HTML</b> — คัดลอกเนื้อหารูปแบบเต็ม → paste ในกล่องเขียนเมลที่ไหนก็ได้</li>
              </ul>
            </div>

            {err && <div className="ms-error" style={{ marginTop: 12 }}>❌ {err}</div>}
            {okMsg && (
              <div style={{ marginTop: 12, padding: '8px 12px', background: '#DCFCE7', color: '#14532D', borderRadius: 6, fontSize: 13 }}>
                {okMsg}
              </div>
            )}
          </div>

          {/* RIGHT — preview */}
          <div className="email-draft-preview">
            <div className="email-draft-preview-head">👁 ตัวอย่างเนื้อหาที่จะส่ง</div>
            <div className="email-draft-preview-body">
              {previewBusy && <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-3)' }}>กำลังโหลด preview...</div>}
              {!previewBusy && previewHtml && (
                <iframe
                  title="email preview"
                  srcDoc={previewHtml}
                  sandbox=""
                  style={{ width: '100%', height: '100%', border: 0, background: '#fff' }}
                />
              )}
              {!previewBusy && !previewHtml && !err && (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-3)' }}>
                  ไม่มี preview
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-foot email-draft-foot">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button className="btn-ghost" onClick={copyHtml} disabled={!previewHtml || busy} title="คัดลอกเนื้อหา HTML ไป paste ในเมลที่ไหนก็ได้">
            📋 คัดลอก HTML
          </button>
          <button className="btn-ghost" onClick={openInOutlook} disabled={!recipientsOk || !draftDataReady || busy} title="เปิดร่างบน Outlook web (Office 365 / Outlook.com)">
            🌐 Outlook เว็บ
          </button>
          <button className="btn-primary" onClick={draftInOutlookDesktop} disabled={!recipientsOk || !draftDataReady || busy} title="เปิด Outlook ที่ติดตั้งในเครื่องทันที พร้อม To/หัวข้อ + คัดลอกเนื้อหารูปแบบเต็มไว้ให้วาง (Ctrl+V)">
            📧 ร่างใน Outlook (เดสก์ท็อป)
          </button>
          {/* SMTP path kept as fallback — hidden by default since it requires
              app password setup. Uncomment to expose to users:
          <button className="btn-ghost" onClick={sendViaSmtp} disabled={!recipientsOk || busy}>
            {busy ? '⏳ กำลังส่ง...' : '📨 ส่งจากระบบ'}
          </button> */}
        </div>
      </div>
    </div>
  );
}
