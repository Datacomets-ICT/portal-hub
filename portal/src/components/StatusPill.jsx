import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

// Slack-style status: emoji + short text + auto-clear timer.
// Two responsibilities:
//   - Display the current user's status as a pill in the nav bar
//   - Edit popover: pick a preset OR custom emoji + text, and an
//     auto-clear duration (5 min .. forever)
//
// State lives on the `user` object (statusEmoji / statusText /
// statusUntil) — login() returns it, updateUser() patches it locally
// after a successful set so the pill updates without a page reload.

const PRESETS = [
  { emoji: '💻', text: 'กำลัง Deep Work', minutes: 120 },
  { emoji: '🍱', text: 'พักเที่ยง',         minutes: 60 },
  { emoji: '🍵', text: 'พักเบรก',           minutes: 30 },
  { emoji: '📞', text: 'อยู่ในประชุม',     minutes: 60 },
  { emoji: '🚗', text: 'ออกข้างนอก',       minutes: 240 },
  { emoji: '🏠', text: 'WFH',               minutes: 0 },
  { emoji: '🤒', text: 'ลาป่วย',            minutes: 0 },
  { emoji: '✈️', text: 'ลาพักร้อน',        minutes: 0 },
];

const DURATIONS = [
  { v: 30,   l: '30 นาที' },
  { v: 60,   l: '1 ชั่วโมง' },
  { v: 240,  l: '4 ชั่วโมง' },
  { v: 480,  l: 'วันนี้ (8 ชม.)' },
  { v: 0,    l: 'ไม่หมดอายุ' },
];

export default function StatusPill() {
  const { user, updateUser, getPassword } = useAuth();
  const [open, setOpen] = useState(false);
  const popRef = useRef(null);

  // Close on outside-click
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!user) return null;

  const hasStatus = !!(user.statusEmoji || user.statusText);
  const expiresIn = user.statusUntil
    ? Math.max(0, Math.round((new Date(user.statusUntil).getTime() - Date.now()) / 60000))
    : null;

  return (
    <div className="status-pill-wrap" ref={popRef}>
      <button
        type="button"
        className={`status-pill ${hasStatus ? 'has-status' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={hasStatus ? `${user.statusEmoji || ''} ${user.statusText || ''}`.trim() : 'ตั้งสถานะ'}
      >
        {hasStatus ? (
          <>
            <span className="status-pill-emoji">{user.statusEmoji || '💬'}</span>
            <span className="status-pill-text">{user.statusText || 'ออนไลน์'}</span>
          </>
        ) : (
          <>
            <span className="status-pill-emoji status-pill-emoji-empty">＋</span>
            <span className="status-pill-text status-pill-text-muted">ตั้งสถานะ</span>
          </>
        )}
      </button>

      {open && (
        <StatusPopover
          current={{ emoji: user.statusEmoji, text: user.statusText, until: user.statusUntil }}
          expiresIn={expiresIn}
          onSave={async (emoji, text, minutes) => {
            const pwd = getPassword();
            try {
              const { error } = await supabase.rpc('set_my_status', {
                p_emp_id: user.employeeId,
                p_password: pwd,
                p_emoji: emoji,
                p_text: text,
                p_minutes: minutes,
              });
              if (error) throw error;
              updateUser({
                statusEmoji: emoji || null,
                statusText: text || null,
                statusUntil: minutes > 0
                  ? new Date(Date.now() + minutes * 60_000).toISOString()
                  : null,
              });
              setOpen(false);
            } catch (err) {
              alert(err.message || 'บันทึกสถานะไม่สำเร็จ');
            }
          }}
          onClear={async () => {
            const pwd = getPassword();
            try {
              const { error } = await supabase.rpc('clear_my_status', {
                p_emp_id: user.employeeId,
                p_password: pwd,
              });
              if (error) throw error;
              updateUser({ statusEmoji: null, statusText: null, statusUntil: null });
              setOpen(false);
            } catch (err) {
              alert(err.message || 'ลบสถานะไม่สำเร็จ');
            }
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function StatusPopover({ current, expiresIn, onSave, onClear, onClose }) {
  const [emoji, setEmoji] = useState(current.emoji || '');
  const [text, setText] = useState(current.text || '');
  const [minutes, setMinutes] = useState(240);

  const pickPreset = (p) => {
    setEmoji(p.emoji);
    setText(p.text);
    setMinutes(p.minutes);
  };

  const canSave = !!(emoji.trim() || text.trim());

  return (
    <div className="status-pop">
      <div className="status-pop-h">
        <span>ตั้งสถานะของคุณ</span>
        <button type="button" className="status-pop-x" onClick={onClose} aria-label="ปิด">✕</button>
      </div>

      {expiresIn != null && current.emoji && (
        <div className="status-pop-cur">
          กำลังใช้: <b>{current.emoji} {current.text}</b>
          <span className="status-pop-exp">หมดอายุใน {expiresIn} นาที</span>
        </div>
      )}

      <div className="status-pop-input-row">
        <input
          className="status-pop-emoji"
          value={emoji}
          onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
          placeholder="🙂"
          maxLength={4}
        />
        <input
          className="status-pop-text"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 60))}
          placeholder="ทำอะไรอยู่..."
          maxLength={60}
        />
      </div>

      <div className="status-pop-presets">
        {PRESETS.map((p) => (
          <button
            key={p.emoji + p.text}
            type="button"
            className="status-pop-preset"
            onClick={() => pickPreset(p)}
          >
            <span>{p.emoji}</span>
            <span>{p.text}</span>
          </button>
        ))}
      </div>

      <div className="status-pop-row">
        <label className="status-pop-dur">
          ล้างอัตโนมัติใน
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {DURATIONS.map((d) => (
              <option key={d.v} value={d.v}>{d.l}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="status-pop-actions">
        {(current.emoji || current.text) && (
          <button type="button" className="status-pop-clear" onClick={onClear}>
            ล้างสถานะ
          </button>
        )}
        <button
          type="button"
          className="status-pop-save"
          onClick={() => onSave(emoji.trim(), text.trim(), minutes)}
          disabled={!canSave}
        >
          บันทึก
        </button>
      </div>
    </div>
  );
}
