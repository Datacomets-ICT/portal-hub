import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import ProfileModal from '../components/ProfileModal.jsx';
import InstallAppButton, { InstallBanner } from '../components/InstallAppButton.jsx';
import StatusPill from '../components/StatusPill.jsx';

const APPS = [
  {
    key: 'it',
    label: 'IT Ticket',
    desc: 'แจ้งปัญหาคอมพิวเตอร์ · ขอใช้บริการจากทีม IT · ติดตามสถานะคำขอ',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
    href: '/it/index.html',
    cardClass: 'card-it',
    tag: 'IT Service',
  },
  {
    key: 'driver',
    label: 'Driver Booking',
    desc: 'จองรถยนต์ส่วนกลาง · ติดตามสถานะคนขับ · ดูประวัติการเดินทาง',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2" />
        <circle cx="6.5" cy="16.5" r="2.5" />
        <circle cx="16.5" cy="16.5" r="2.5" />
      </svg>
    ),
    href: '/driver/index.html',
    cardClass: 'card-driver',
    tag: 'Logistics',
  },
  {
    key: 'meeting',
    label: 'Meeting Rooms',
    desc: 'จองห้องประชุม · ดูตารางห้องว่าง · บันทึกคำขอเบรก/อุปกรณ์',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" />
        <path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />
      </svg>
    ),
    href: '/meeting/index.html',
    cardClass: 'card-meeting',
    tag: 'Workplace',
  },
  {
    key: 'repair',
    label: 'Repair Service',
    desc: 'แจ้งซ่อมอุปกรณ์/เครื่องมือ · ติดตามสถานะ · เบิก/ยืม/ซื้ออะไหล่',
    icon: (
      // Wrench
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
    href: '/repair',           // SPA route, not a static html app
    cardClass: 'card-repair',
    tag: 'Maintenance',
    comingSoon: true,
  },
];

// Drop the leading code (e.g. "A62_วิเคราะห์ข้อมูล" → "วิเคราะห์ข้อมูล").
// HR exports section/position fields with a department-code prefix that
// users don't need to see in the Workspace greeting card.
function stripCode(s) {
  return (s || '').replace(/^[A-Za-z]\d+_/, '');
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function greeting(d) {
  const h = d.getHours();
  if (h < 12) return 'อรุณสวัสดิ์';
  if (h < 17) return 'สวัสดีตอนบ่าย';
  return 'สวัสดีตอนเย็น';
}

function useToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const show = (text, kind = 'success') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ text, kind });
    timerRef.current = setTimeout(() => setToast(null), 2600);
  };
  useEffect(() => () => clearTimeout(timerRef.current), []);
  return { toast, show };
}

export default function HubPage() {
  const { user, apps, loadingApps, logout } = useAuth();
  const navigate = useNavigate();
  const now = useClock();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileTab, setProfileTab] = useState('info');
  const menuRef = useRef(null);
  const { toast, show: showToast } = useToast();

  const allowedKeys = new Set(apps || []);
  const showAll = !loadingApps && allowedKeys.size === 0;
  const visibleApps = APPS.filter((a) => showAll || allowedKeys.has(a.key));

  const onLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const openApp = (href) => {
    // SPA routes (e.g. /repair) → use react-router so we don't full-reload.
    // External static apps (/.../index.html) keep using window.location so
    // their bundles get served fresh from /it/, /driver/, /meeting/.
    if (href.startsWith('/') && !href.includes('.html')) {
      navigate(href);
    } else {
      window.location.href = href;
    }
  };

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const display = user?.nickname || user?.firstName || user?.employeeId || '';
  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') || display;
  const avatarChar = (display || '?').charAt(0).toUpperCase();
  const hasAvatar = !!user?.avatarUrl;

  const dateStr = now.toLocaleDateString('th-TH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  const openProfile = (tab) => {
    setProfileTab(tab || 'info');
    setProfileOpen(true);
    setMenuOpen(false);
  };

  return (
    <div className="shell">
      <header className="shell-nav">
        <div className="brand">
          <div className="brand-mark">P</div>
          <div className="brand-name">Workspace</div>
        </div>
        <div className="spacer" />
        <StatusPill />
        <InstallAppButton />
        <div className="nav-time">
          <span className="nav-time-day">{dateStr}</span>
          <span className="nav-time-clock">{timeStr}</span>
        </div>
        <div className="menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="user-btn"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="avatar">
              {hasAvatar ? <img src={user.avatarUrl} alt="" /> : avatarChar}
            </span>
            <span className="user-name">
              {display}
              <span className="user-id"> · {user?.employeeId}</span>
            </span>
            <span className="caret" aria-hidden="true">▾</span>
          </button>
          {menuOpen && (
            <div className="menu-pop" role="menu">
              <button type="button" className="menu-pop-item" onClick={() => openProfile('info')}>
                <span className="ic">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                ข้อมูลส่วนตัว
              </button>
              <button type="button" className="menu-pop-item" onClick={() => openProfile('avatar')}>
                <span className="ic">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </span>
                เปลี่ยนรูปโปรไฟล์
              </button>
              <button type="button" className="menu-pop-item" onClick={() => openProfile('password')}>
                <span className="ic">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                  </svg>
                </span>
                เปลี่ยนรหัสผ่าน
              </button>
              <button type="button" className="menu-pop-item" onClick={() => openProfile('theme')}>
                <span className="ic">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 3a9 9 0 0 0 0 18" />
                  </svg>
                </span>
                ธีมและสี
              </button>
              <button type="button" className="menu-pop-item" onClick={() => openProfile('notify')}>
                <span className="ic">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </span>
                การแจ้งเตือน
              </button>
              <div className="menu-pop-divider" />
              <button
                type="button"
                className="menu-pop-item"
                onClick={() => { setMenuOpen(false); navigate('/people'); }}
              >
                <span className="ic">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </span>
                เพื่อนร่วมงาน
              </button>
              {(user?.role === 'system' || user?.isAdmin === true || user?.itRole === 'admin') && (
                <button
                  type="button"
                  className="menu-pop-item"
                  onClick={() => { setMenuOpen(false); navigate('/it-backfill'); }}
                >
                  <span className="ic">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="12" y1="18" x2="12" y2="12" />
                      <line x1="9" y1="15" x2="15" y2="15" />
                    </svg>
                  </span>
                  Backfill Ticket
                </button>
              )}
              {(user?.role === 'system' || user?.isAdmin === true) && (
                <>
                  <div className="menu-pop-divider" />
                  <button
                    type="button"
                    className="menu-pop-item"
                    onClick={() => { setMenuOpen(false); navigate('/admin'); }}
                  >
                    <span className="ic">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                    </span>
                    Admin System
                  </button>
                </>
              )}
              <div className="menu-pop-divider" />
              <button type="button" className="menu-pop-item menu-pop-danger" onClick={onLogout}>
                <span className="ic">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                  </svg>
                </span>
                ออกจากระบบ
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="hub-wrap">
        <InstallBanner />
        <section className="hub-hero">
          <div className="hub-hero-card">
            <div className="hub-hero-deco" aria-hidden="true">
              <span className="orb orb-1" />
              <span className="orb orb-2" />
            </div>
            <p className="hub-greet">
              <span className="dot-blink" /> {dateStr}
            </p>
            <h1 className="hub-name">
              {greeting(now)}คุณ <span>{display}</span>
            </h1>
            <div className="hub-info-row">
              {user?.department && (
                <span className="hub-chip">
                  <span className="hub-chip-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <path d="M9 22V12h6v10" />
                    </svg>
                  </span>
                  {stripCode(user.department)}
                </span>
              )}
              {user?.section && (
                <span className="hub-chip">
                  <span className="hub-chip-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" />
                      <rect x="14" y="3" width="7" height="7" />
                      <rect x="14" y="14" width="7" height="7" />
                      <rect x="3" y="14" width="7" height="7" />
                    </svg>
                  </span>
                  {stripCode(user.section)}
                </span>
              )}
              {user?.position && (
                <span className="hub-chip">
                  <span className="hub-chip-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="8" r="5" />
                      <path d="M20 21a8 8 0 0 0-16 0" />
                    </svg>
                  </span>
                  {stripCode(user.position)}
                </span>
              )}
              <span className="hub-chip">
                <span className="hub-chip-icon">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M2 10h20" />
                  </svg>
                </span>
                ID {user?.employeeId}
              </span>
            </div>
          </div>

          <div className="hub-clock-card">
            <div className="hub-clock-glow" aria-hidden="true" />
            <span className="hub-clock-label">เวลาปัจจุบัน</span>
            <div className="hub-clock-time">{timeStr}</div>
            <span className="hub-clock-date">{dateStr}</span>
            <div className="hub-clock-meta">
              <span className="meta-pill">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                Online
              </span>
              <span className="meta-pill">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" />
                  <path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20" />
                </svg>
                SSO
              </span>
            </div>
          </div>
        </section>

        <div className="hub-section-head">
          <h2 className="hub-section-title">แอปของคุณ</h2>
          <span className="hub-section-meta">
            {loadingApps ? 'กำลังโหลด…' : `${visibleApps.length} แอปพร้อมใช้งาน`}
          </span>
        </div>

        {loadingApps ? (
          <div className="app-grid">
            {[0, 1, 2].map((i) => (
              <div key={i} className="app-card skeleton" />
            ))}
          </div>
        ) : (
          <div className="app-grid">
            {visibleApps.map((app) => (
              <button
                key={app.key}
                type="button"
                className={`app-card ${app.cardClass} ${app.comingSoon ? 'is-coming-soon' : ''}`}
                onClick={() => openApp(app.href)}
              >
                <div className="card-tag">{app.tag}</div>
                {app.comingSoon && (
                  <div className="card-soon-badge">เร็วๆ นี้</div>
                )}
                <div className="icon-wrap">
                  <span className="icon-glow" aria-hidden="true" />
                  <span className="icon">{app.icon}</span>
                </div>
                <h3>{app.label}</h3>
                <p>{app.desc}</p>
                <span className="cta">
                  {app.comingSoon ? 'ดูรายละเอียด' : 'เปิดแอป'}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="hub-footer">
          Workspace · Single sign-on สำหรับระบบภายในองค์กร
        </div>
      </main>

      {profileOpen && (
        <ProfileModal
          initialTab={profileTab}
          onClose={() => setProfileOpen(false)}
          onToast={showToast}
        />
      )}

      {toast && (
        <div className={`toast ${toast.kind}`} role="status">
          <span className="ic">
            {toast.kind === 'success' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <path d="M22 4L12 14.01l-3-3" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
            )}
          </span>
          <span>{toast.text}</span>
        </div>
      )}

      <SupportFAB onCopy={(label) => showToast(`คัดลอก ${label} แล้ว`, 'success')} />
    </div>
  );
}

// Floating "Contact System" button — bottom-right of the hub. Click to
// reveal the System owner's email / Line / phone for bug reports or
// "ฉันเข้าแอพไม่ได้" issues. Each row click-to-copy + opens the relevant
// app (mailto:, tel:, line://).
function SupportFAB({ onCopy }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      if (onCopy) onCopy(label);
    } catch {
      // fallback for older browsers — just open the link
    }
  };

  const items = [
    {
      key: 'mail',
      label: 'อีเมล',
      value: 'sls03@cometsintertrade.com',
      href: 'mailto:sls03@cometsintertrade.com?subject=' + encodeURIComponent('แจ้งปัญหา Workspace'),
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
      ),
    },
    {
      key: 'line',
      label: 'LINE ID',
      value: '0647241793',
      href: 'https://line.me/ti/p/~0647241793',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.4 9.5C19.4 6.1 16 3.3 11.7 3.3S4 6.1 4 9.5c0 3.1 2.7 5.7 6.4 6.1.2 0 .6.2.7.4.1.2.1.5 0 .7-.1.4-.2 1-.2 1.1 0 .3-.3.6.5.3 1.1-.5 5.7-3.4 7.7-5.7 1.4-1.6 2.3-3.2 2.3-2.9z" />
        </svg>
      ),
    },
    {
      key: 'tel',
      label: 'โทร',
      value: '0646967494',
      href: 'tel:0646967494',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="support-fab" ref={wrapRef}>
      {open && (
        <div className="support-pop" role="dialog" aria-label="ติดต่อ System">
          <div className="support-pop-head">
            <div>
              <div className="support-pop-title">ติดต่อ System</div>
              <div className="support-pop-sub">แจ้งบัค · เว็บล่ม · เข้าแอพไม่ได้</div>
            </div>
            <button type="button" className="support-pop-x" onClick={() => setOpen(false)} aria-label="ปิด">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          {items.map((it) => (
            <div key={it.key} className="support-pop-row">
              <a className="support-pop-link" href={it.href} target="_blank" rel="noreferrer">
                <span className="support-pop-icon">{it.icon}</span>
                <span className="support-pop-text">
                  <span className="support-pop-label">{it.label}</span>
                  <span className="support-pop-value">{it.value}</span>
                </span>
              </a>
              <button
                type="button"
                className="support-pop-copy"
                onClick={() => copy(it.value, it.label)}
                aria-label={'คัดลอก ' + it.label}
                title="คัดลอก"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
            </div>
          ))}
          <div className="support-pop-foot">
            กรุณาแจ้ง <b>อาการที่เจอ</b> + <b>หน้าจอ/แอพ</b> ที่มีปัญหา
          </div>
        </div>
      )}
      <button
        type="button"
        className={'support-btn' + (open ? ' is-open' : '')}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="ติดต่อ System"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        <span className="support-btn-label">ติดต่อ System</span>
      </button>
    </div>
  );
}
