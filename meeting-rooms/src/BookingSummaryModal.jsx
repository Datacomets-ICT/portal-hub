// Booking-level AI summary modal. Replaces the in-room AI summary section
// that lived in MeetingRoomPanel — moved here so summaries are reviewed
// from "ประวัติการจอง" (booking history) instead of cluttering the live
// meeting window.
//
// Pulls everything that's already in the DB for that booking (chat +
// agenda + files + transcript if any) via /api/meeting-auto-summary and
// renders the structured result.
import { useEffect, useState } from 'react';

export default function BookingSummaryModal({ booking, attachments = [], onClose }) {
  const [summary, setSummary] = useState(booking?.autoSummary || null);
  const [busy, setBusy] = useState(false);
  const [includeFiles, setIncludeFiles] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setSummary(booking?.autoSummary || null);
    setErr(null);
  }, [booking?.id, booking?.autoSummary]);

  const generate = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch('/api/meeting-auto-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: booking.id, include_files: includeFiles }),
      });
      const raw = await r.text();
      let data;
      try { data = JSON.parse(raw); }
      catch {
        const snip = raw.slice(0, 120).replace(/\s+/g, ' ');
        throw new Error(`เซิร์ฟเวอร์ตอบไม่ใช่ JSON (${r.status}): ${snip}`);
      }
      if (!data.ok) throw new Error(data.error || 'สรุปไม่สำเร็จ');
      setSummary(data.summary);
    } catch (e) {
      setErr(e.message || 'สรุปไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  if (!booking) return null;

  return (
    <div className="mtg-room-backdrop" onClick={onClose}>
      <div className="mtg-room-panel" onClick={(e) => e.stopPropagation()}>
        <header className="mtg-room-head">
          <div>
            <div className="mtg-room-kicker">🤖 สรุปการประชุม (AI)</div>
            <h2 className="mtg-room-title">{booking.title || 'การประชุม'}</h2>
          </div>
          <button className="mtg-room-close" onClick={onClose}>✕</button>
        </header>

        <section className="mtg-room-section mtg-auto-summary" style={{ marginTop: 8 }}>
          {summary ? (
            <div className="mtg-summary-card">
              {summary.tldr && (
                <div className="mtg-summary-tldr">
                  <span className="mtg-summary-label">TL;DR</span>
                  <span>{summary.tldr}</span>
                </div>
              )}
              {summary.key_points?.length > 0 && (
                <div className="mtg-summary-block">
                  <div className="mtg-summary-label">ประเด็นสำคัญ</div>
                  <ul>{summary.key_points.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}
              {summary.decisions?.length > 0 && (
                <div className="mtg-summary-block">
                  <div className="mtg-summary-label">ข้อตัดสินใจ</div>
                  <ul>{summary.decisions.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}
              {summary.action_items?.length > 0 && (
                <div className="mtg-summary-block">
                  <div className="mtg-summary-label">Action Items</div>
                  <ul>
                    {summary.action_items.map((a, i) => (
                      <li key={i}>
                        {a.task}
                        {a.owner && <span className="mtg-owner"> · {a.owner}</span>}
                        {a.due && <span className="mtg-due"> · กำหนด {a.due}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.next_steps?.length > 0 && (
                <div className="mtg-summary-block">
                  <div className="mtg-summary-label">ขั้นถัดไป</div>
                  <ul>{summary.next_steps.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}
              <div className="mtg-summary-files-used">
                <span style={{ marginRight: 6 }}>📥 แหล่งข้อมูลที่ใช้:</span>
                <span className="mtg-file-used mtg-file-ok">agenda + chat + meta</span>
                {summary._used_audio && <span className="mtg-file-used mtg-file-ok">🎙️ transcript เสียง</span>}
                {(summary._files || []).map((f, i) => (
                  <span key={i} className={`mtg-file-used mtg-file-${f.status === 'ok' || f.status === 'truncated' ? 'ok' : 'skip'}`}>
                    {f.file_name}
                    {f.status === 'truncated' && ' (ตัดท้าย)'}
                    {f.status === 'no-text' && ' (อ่านไม่ได้)'}
                  </span>
                ))}
              </div>
              <div className="mtg-summary-actions">
                <button className="btn-ghost" onClick={generate} disabled={busy}>🔄 สร้างใหม่</button>
              </div>
            </div>
          ) : (
            <div className="mtg-summary-empty">
              <p>กดเพื่อให้ AI สรุปจาก<b>ทุกข้อมูล</b>ของการประชุมนี้ — meta · agenda · แชท{attachments.length > 0 ? ` · ไฟล์แนบ ${attachments.length} ไฟล์` : ''} · transcript เสียง (ถ้ามี)</p>
              {attachments.length > 0 && (
                <label className="mtg-summary-toggle">
                  <input type="checkbox" checked={includeFiles} onChange={(e) => setIncludeFiles(e.target.checked)} />
                  <span>รวมเนื้อหาไฟล์แนบ ({attachments.length} ไฟล์) เข้าไปด้วย</span>
                </label>
              )}
              <button className="btn-primary" onClick={generate} disabled={busy}>
                {busy ? 'กำลังสรุป...' : '✨ สร้างสรุป AI'}
              </button>
              <div className="mtg-summary-quota">
                ℹ️ ใช้ Gemini Flash (ฟรี) · จำกัด 15 ครั้ง/นาที · <b>1,500 ครั้ง/วัน</b> ทั้งบริษัท
              </div>
              {err && <div className="view-error" style={{ marginTop: 10 }}>{err}</div>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
