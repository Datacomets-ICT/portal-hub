import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import {
  applyAccent,
  applyFontSize,
  applyTheme,
  clearPrefs,
  getNotifPref,
  loadPrefs,
  setNotifPref,
} from '../lib/profile.js';

// Match IT-Ticket avatar storage so the same image surfaces in both apps.
const STORAGE_BUCKET = 'ticket-attachments';
const MAX_AVATAR_MB = 5;

const TABS = [
  { id: 'info', label: 'ข้อมูล', icon: <IconUser /> },
  { id: 'avatar', label: 'รูปโปรไฟล์', icon: <IconCamera /> },
  { id: 'password', label: 'รหัสผ่าน', icon: <IconKey /> },
  { id: 'theme', label: 'ธีม', icon: <IconPalette /> },
  { id: 'notify', label: 'แจ้งเตือน', icon: <IconBell /> },
];

const ACCENTS = ['indigo', 'blue', 'green', 'pink', 'orange', 'purple'];

export default function ProfileModal({ initialTab = 'info', onClose, onToast }) {
  const { user, updateUser, updatePassword, getPassword } = useAuth();
  const [tab, setTab] = useState(initialTab);
  const [busy, setBusy] = useState(false);

  const display = user?.nickname || user?.firstName || 'User';
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || display;
  const sub = `${user?.employeeId || '-'} · ${user?.department || '-'}${user?.section ? ' / ' + user.section : ''}`;

  const toast = (text, kind = 'success') => {
    if (onToast) onToast(text, kind);
  };

  // Close on ESC
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  if (!user) return null;

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div className="modal profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="profile-head">
          <div className="profile-hero-row">
            <div className="avatar-md">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" />
              ) : (
                display.charAt(0).toUpperCase()
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3>{fullName}</h3>
              <div className="sub">{sub}</div>
            </div>
            <button
              type="button"
              className="modal-close"
              onClick={() => !busy && onClose()}
              aria-label="ปิด"
            >
              ×
            </button>
          </div>
        </div>

        <div className="profile-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}
            >
              <span className="ic">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="profile-body">
          {tab === 'info' && (
            <InfoSection
              user={user}
              busy={busy}
              setBusy={setBusy}
              updateUser={updateUser}
              getPassword={getPassword}
              toast={toast}
              onDone={onClose}
            />
          )}
          {tab === 'avatar' && (
            <AvatarSection
              user={user}
              busy={busy}
              setBusy={setBusy}
              updateUser={updateUser}
              getPassword={getPassword}
              toast={toast}
            />
          )}
          {tab === 'password' && (
            <PasswordSection
              user={user}
              busy={busy}
              setBusy={setBusy}
              updatePassword={updatePassword}
              toast={toast}
              onDone={onClose}
            />
          )}
          {tab === 'theme' && <ThemeSection toast={toast} onDone={onClose} />}
          {tab === 'notify' && <NotifySection onDone={onClose} />}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Info section
   ========================================================= */
function InfoSection({ user, busy, setBusy, updateUser, getPassword, toast, onDone }) {
  const [nickname, setNickname] = useState(user.nickname || '');
  const [email, setEmail] = useState(user.email || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [lineId, setLineId] = useState(user.lineId || '');

  const save = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('update_my_profile', {
        p_emp_id: user.employeeId,
        p_password: getPassword(),
        p_nickname: nickname.trim(),
        p_email: email.trim(),
        p_phone: phone.trim(),
        p_line_id: lineId.trim(),
      });
      if (error) throw error;
      if (!data || !data.success) throw new Error(data?.message || 'บันทึกไม่สำเร็จ');

      updateUser({
        nickname: nickname.trim(),
        email: email.trim(),
        phone: phone.trim(),
        lineId: lineId.trim(),
      });
      toast('บันทึกข้อมูลเรียบร้อย', 'success');
      onDone();
    } catch (err) {
      toast(err.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="field">
        <label>ชื่อเล่น</label>
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="เช่น โบ๊ท"
          maxLength={50}
          disabled={busy}
        />
      </div>
      <div className="form-row">
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            maxLength={100}
            disabled={busy}
          />
        </div>
        <div className="field">
          <label>เบอร์โทร</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="08x-xxx-xxxx"
            maxLength={20}
            disabled={busy}
          />
        </div>
      </div>
      <div className="field">
        <label>LINE ID</label>
        <input
          type="text"
          value={lineId}
          onChange={(e) => setLineId(e.target.value)}
          placeholder="เช่น @mylineid"
          maxLength={50}
          disabled={busy}
        />
      </div>
      <p className="note">รหัสพนักงาน ชื่อ-นามสกุล และแผนก แก้ไขไม่ได้ ติดต่อ IT หากต้องการแก้</p>
      <div className="profile-actions">
        <button type="button" className="btn btn-outline" onClick={onDone} disabled={busy}>
          ปิด
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      </div>
    </>
  );
}

/* =========================================================
   Avatar section
   ========================================================= */
function AvatarSection({ user, busy, setBusy, updateUser, getPassword, toast }) {
  const fileRef = useRef(null);
  const display = user.nickname || user.firstName || 'U';

  const onPick = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (e.target) e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      toast('กรุณาเลือกไฟล์รูปภาพ', 'error');
      return;
    }
    if (f.size > MAX_AVATAR_MB * 1024 * 1024) {
      toast(`ไฟล์ใหญ่เกิน ${MAX_AVATAR_MB}MB`, 'error');
      return;
    }

    setBusy(true);
    try {
      const ext = (f.name.split('.').pop() || 'jpg').toLowerCase();
      const rand = Math.random().toString(36).slice(2, 10);
      const path = `avatars/${user.employeeId}_${Date.now()}_${rand}.${ext}`;

      const up = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, f, { contentType: f.type, upsert: false });
      if (up.error) throw up.error;

      const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      const url = pub.publicUrl;

      const { data, error } = await supabase.rpc('update_my_avatar', {
        p_emp_id: user.employeeId,
        p_password: getPassword(),
        p_avatar_url: url,
      });
      if (error) throw error;
      if (!data || !data.success) throw new Error(data?.message || 'บันทึกรูปไม่สำเร็จ');

      updateUser({ avatarUrl: url });
      toast('เปลี่ยนรูปโปรไฟล์เรียบร้อย', 'success');
    } catch (err) {
      toast(err.message || 'อัปโหลดไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!user.avatarUrl) return;
    if (!window.confirm('ต้องการลบรูปโปรไฟล์ใช่ไหม?')) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('update_my_avatar', {
        p_emp_id: user.employeeId,
        p_password: getPassword(),
        p_avatar_url: '',
      });
      if (error) throw error;
      if (!data || !data.success) throw new Error(data?.message || 'ลบรูปไม่สำเร็จ');
      updateUser({ avatarUrl: '' });
      toast('ลบรูปโปรไฟล์เรียบร้อย', 'success');
    } catch (err) {
      toast(err.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="avatar-editor">
      <div className="avatar-big">
        {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : display.charAt(0).toUpperCase()}
      </div>
      <div className="avatar-actions">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onPick}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          {busy ? 'กำลังประมวลผล…' : 'อัปโหลดรูป'}
        </button>
        {user.avatarUrl && (
          <button type="button" className="btn btn-outline" onClick={remove} disabled={busy}>
            ลบรูป
          </button>
        )}
      </div>
      <p className="note" style={{ textAlign: 'center' }}>
        รองรับ JPG/PNG ขนาดไม่เกิน {MAX_AVATAR_MB}MB · จะแสดงในแชทและทุกแอปในพอร์ทัล
      </p>
    </div>
  );
}

/* =========================================================
   Password section
   ========================================================= */
function PasswordSection({ user, busy, setBusy, updatePassword, toast, onDone }) {
  const [oldP, setOldP] = useState('');
  const [newP, setNewP] = useState('');
  const [confP, setConfP] = useState('');

  const submit = async () => {
    if (!oldP || !newP) {
      toast('กรุณากรอกรหัสผ่านให้ครบ', 'error');
      return;
    }
    if (newP.length < 4) {
      toast('รหัสผ่านใหม่อย่างน้อย 4 ตัวอักษร', 'error');
      return;
    }
    if (newP !== confP) {
      toast('รหัสผ่านใหม่และยืนยันไม่ตรงกัน', 'error');
      return;
    }
    if (newP === oldP) {
      toast('รหัสผ่านใหม่ต้องไม่เหมือนเดิม', 'error');
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('change_my_password', {
        p_emp_id: user.employeeId,
        p_old_password: oldP,
        p_new_password: newP,
      });
      if (error) throw error;
      if (!data || !data.success) throw new Error(data?.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');

      updatePassword(newP);
      setOldP('');
      setNewP('');
      setConfP('');
      toast('เปลี่ยนรหัสผ่านเรียบร้อย', 'success');
      onDone();
    } catch (err) {
      toast(err.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="field">
        <label>
          รหัสผ่านเดิม <span style={{ color: 'var(--danger)' }}>*</span>
        </label>
        <input
          type="password"
          autoComplete="current-password"
          value={oldP}
          onChange={(e) => setOldP(e.target.value)}
          disabled={busy}
        />
      </div>
      <div className="field">
        <label>
          รหัสผ่านใหม่ <span style={{ color: 'var(--danger)' }}>*</span>
        </label>
        <input
          type="password"
          autoComplete="new-password"
          value={newP}
          onChange={(e) => setNewP(e.target.value)}
          disabled={busy}
        />
        <p className="note">อย่างน้อย 4 ตัวอักษร</p>
      </div>
      <div className="field">
        <label>
          ยืนยันรหัสผ่านใหม่ <span style={{ color: 'var(--danger)' }}>*</span>
        </label>
        <input
          type="password"
          autoComplete="new-password"
          value={confP}
          onChange={(e) => setConfP(e.target.value)}
          disabled={busy}
        />
      </div>
      <div className="profile-actions">
        <button type="button" className="btn btn-outline" onClick={onDone} disabled={busy}>
          ปิด
        </button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'กำลังเปลี่ยน…' : 'เปลี่ยนรหัสผ่าน'}
        </button>
      </div>
    </>
  );
}

/* =========================================================
   Theme section
   ========================================================= */
function ThemeSection({ toast, onDone }) {
  const [prefs, setPrefs] = useState(() => loadPrefs());
  const themeMode = prefs.theme || 'light';
  const accent = prefs.accent || 'indigo';
  const fontsize = prefs.fontsize || 'm';

  const onTheme = (m) => {
    applyTheme(m);
    setPrefs((p) => ({ ...p, theme: m }));
  };
  const onAccent = (c) => {
    applyAccent(c);
    setPrefs((p) => ({ ...p, accent: c }));
  };
  const onFont = (s) => {
    applyFontSize(s);
    setPrefs((p) => ({ ...p, fontsize: s }));
  };
  const reset = () => {
    clearPrefs();
    applyTheme('light', true);
    applyAccent('indigo', true);
    applyFontSize('m', true);
    setPrefs({});
    toast('รีเซ็ตการตั้งค่าธีมเรียบร้อย', 'success');
  };

  return (
    <>
      <div className="field">
        <label>โหมดธีม</label>
        <div className="theme-grid">
          <RadioCard name="themeMode" value="light" current={themeMode} onChange={onTheme} icon={<IconSun />} label="Light" />
          <RadioCard name="themeMode" value="dark" current={themeMode} onChange={onTheme} icon={<IconMoon />} label="Dark" />
          <RadioCard name="themeMode" value="auto" current={themeMode} onChange={onTheme} icon={<IconAuto />} label="Auto" />
        </div>
      </div>

      <div className="field">
        <label>สีหลัก (Accent)</label>
        <div className="color-swatches">
          {ACCENTS.map((c) => (
            <label key={c} className={`cs-${c}`}>
              <input
                type="radio"
                name="accent"
                value={c}
                checked={accent === c}
                onChange={() => onAccent(c)}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="field">
        <label>ขนาดตัวอักษร</label>
        <div className="theme-grid">
          <RadioCard name="fontsize" value="s" current={fontsize} onChange={onFont} icon={<IconText size={14} />} label="เล็ก" />
          <RadioCard name="fontsize" value="m" current={fontsize} onChange={onFont} icon={<IconText size={16} />} label="กลาง" />
          <RadioCard name="fontsize" value="l" current={fontsize} onChange={onFont} icon={<IconText size={18} />} label="ใหญ่" />
        </div>
      </div>

      <p className="note">การตั้งค่าจะถูกบันทึกในเครื่องนี้อัตโนมัติ และใช้ร่วมกับ IT-Ticket</p>
      <div className="profile-actions">
        <button type="button" className="btn btn-outline" onClick={reset}>
          รีเซ็ต
        </button>
        <button type="button" className="btn btn-primary" onClick={onDone}>
          เสร็จสิ้น
        </button>
      </div>
    </>
  );
}

function RadioCard({ name, value, current, onChange, icon, label }) {
  return (
    <label>
      <input
        type="radio"
        name={name}
        value={value}
        checked={current === value}
        onChange={() => onChange(value)}
      />
      <span className="ic">{icon}</span>
      {label}
    </label>
  );
}

/* =========================================================
   Notify section
   ========================================================= */
function NotifySection({ onDone }) {
  const [sound, setSound] = useState(() => getNotifPref('sound', true));
  const [popup, setPopup] = useState(() => getNotifPref('popup', true));

  return (
    <>
      <div className="toggle-row">
        <div className="toggle-text">
          <div className="label">เสียงแจ้งเตือน</div>
          <div className="desc">เสียง beep เมื่อมี Ticket ใหม่หรือข้อความเข้า</div>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={sound}
            onChange={(e) => {
              setSound(e.target.checked);
              setNotifPref('sound', e.target.checked);
            }}
          />
          <span className="slider" />
        </label>
      </div>
      <div className="toggle-row">
        <div className="toggle-text">
          <div className="label">Popup แจ้งเตือน</div>
          <div className="desc">กล่องเด้งขวาบนเมื่อมี Ticket ใหม่</div>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={popup}
            onChange={(e) => {
              setPopup(e.target.checked);
              setNotifPref('popup', e.target.checked);
            }}
          />
          <span className="slider" />
        </label>
      </div>
      <p className="note">การตั้งค่าจะถูกบันทึกในเครื่องนี้อัตโนมัติ และใช้ร่วมกับ IT-Ticket</p>
      <div className="profile-actions">
        <button type="button" className="btn btn-primary" onClick={onDone}>
          เสร็จสิ้น
        </button>
      </div>
    </>
  );
}

/* =========================================================
   Inline icons (lucide-style, single stroke)
   ========================================================= */
function svg(children, size = 16) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}
function IconUser() {
  return svg(
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  );
}
function IconCamera() {
  return svg(
    <>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </>
  );
}
function IconKey() {
  return svg(
    <>
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </>
  );
}
function IconPalette() {
  return svg(
    <>
      <circle cx="13.5" cy="6.5" r=".5" />
      <circle cx="17.5" cy="10.5" r=".5" />
      <circle cx="8.5" cy="7.5" r=".5" />
      <circle cx="6.5" cy="12.5" r=".5" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </>
  );
}
function IconBell() {
  return svg(
    <>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </>
  );
}
function IconSun() {
  return svg(
    <>
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </>
  );
}
function IconMoon() {
  return svg(<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />);
}
function IconAuto() {
  return svg(
    <>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  );
}
function IconText({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7V5h16v2M9 19h6M12 5v14" />
    </svg>
  );
}
