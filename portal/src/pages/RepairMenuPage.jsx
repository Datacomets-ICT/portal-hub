import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

// /repair — landing menu with 7 tiles. Mirrors the legacy PowerApps home
// screen so ช่าง teams can find the same modules in the same places.

const TILES = [
  { key: 'new',         to: '/repair/new',              title: 'ใบแจ้งซ่อม',                icon: '📝', desc: 'แจ้งซ่อมใหม่',                 color: '#2563eb', tint: 'rgba(37,99,235,0.10)' },
  { key: 'jobs',        to: '/repair/jobs',             title: 'หน้าสถานะ',                icon: '📊', desc: 'ตารางและสถานะงานซ่อม',          color: '#0891b2', tint: 'rgba(8,145,178,0.10)' },
  { key: 'inspection',  to: '/repair/inspections',      title: 'ใบตรวจประจำเดือน',         icon: '🔍', desc: 'การตรวจสอบประจำเดือน',         color: '#7c3aed', tint: 'rgba(124,58,237,0.10)' },
  { key: 'equipment',   to: '/repair/equipment',        title: 'หน้าอุปกรณ์',              icon: '🧰', desc: 'สต๊อกอะไหล่ + อุปกรณ์',         color: '#ea580c', tint: 'rgba(234,88,12,0.10)' },
  { key: 'handover',    to: '/repair/handovers',        title: 'เอกสารส่งมอบทรัพย์สิน',    icon: '📦', desc: 'ใบส่งมอบ + รายการ',             color: '#16a34a', tint: 'rgba(22,163,74,0.10)' },
  { key: 'factory',     to: '/repair/factory-requests', title: 'ใบขอเบิกอุปกรณ์จากโรงงาน', icon: '🏭', desc: 'ขอเบิก / อนุมัติ / รับของ',     color: '#db2777', tint: 'rgba(219,39,119,0.10)' },
  { key: 'pdf',         to: '/repair/pdf',              title: 'เก็บ PDF',                  icon: '📁', desc: 'คลังเอกสาร PDF ย้อนหลัง',       color: '#475569', tint: 'rgba(71,85,105,0.10)' },
];

function fullName(u) {
  if (!u) return '';
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.nickname || u.employeeId || '';
}

function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
}

export default function RepairMenuPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const name = fullName(user);
  const dept = user.department || '';
  const code = user.employeeId || '';

  return (
    <div className="rpr-shell">
      <header className="rpr-head">
        <button className="rpr-back" onClick={() => navigate('/hub')}>← กลับ</button>
        <h1>ระบบช่างประจำอาคาร</h1>
      </header>

      <div className="rpr-welcome">
        <div className="rpr-welcome-avatar">
          {user.avatarUrl
            ? <img src={user.avatarUrl} alt={name} />
            : initials(name).toUpperCase()}
        </div>
        <div className="rpr-welcome-text">
          <div className="rpr-welcome-hi">สวัสดี</div>
          <div className="rpr-welcome-name">{name || '—'}</div>
          <div className="rpr-welcome-meta">
            {code && <>รหัส <strong>{code}</strong></>}
            {code && dept && <> · </>}
            {dept && <>{dept}</>}
          </div>
        </div>
      </div>

      <div className="rpr-menu-grid">
        {TILES.map((t) => (
          <button
            key={t.key}
            type="button"
            className="rpr-tile"
            style={{ '--tile-color': t.color, '--tile-tint': t.tint }}
            onClick={() => navigate(t.to)}
          >
            <div className="rpr-tile-icon">{t.icon}</div>
            <div className="rpr-tile-title">{t.title}</div>
            <div className="rpr-tile-desc">{t.desc}</div>
            <div className="rpr-tile-arrow">→</div>
          </button>
        ))}
      </div>
    </div>
  );
}
