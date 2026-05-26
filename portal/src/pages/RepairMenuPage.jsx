import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

// /repair — landing menu with 7 tiles. Mirrors the legacy PowerApps home
// screen so ช่าง teams can find the same modules in the same places.

const TILES = [
  { key: 'new',         to: '/repair/new',              title: 'ใบแจ้งซ่อม',                emoji: '📝', desc: 'แจ้งซ่อมใหม่' },
  { key: 'jobs',        to: '/repair/jobs',             title: 'หน้าสถานะ',                emoji: '📊', desc: 'ตารางและสถานะงานซ่อม' },
  { key: 'inspection',  to: '/repair/inspections',      title: 'ใบตรวจประจำเดือน',         emoji: '🔍', desc: 'การตรวจสอบประจำเดือน' },
  { key: 'equipment',   to: '/repair/equipment',        title: 'หน้าอุปกรณ์',              emoji: '🧰', desc: 'สต๊อกอะไหล่ + อุปกรณ์' },
  { key: 'handover',    to: '/repair/handovers',        title: 'เอกสารส่งมอบทรัพย์สิน',    emoji: '📦', desc: 'ใบส่งมอบ + รายการ' },
  { key: 'factory',     to: '/repair/factory-requests', title: 'ใบขอเบิกอุปกรณ์จากโรงงาน', emoji: '🏭', desc: 'ขอเบิก / อนุมัติ / รับของ' },
  { key: 'pdf',         to: '/repair/pdf',              title: 'เก็บ PDF',                   emoji: '📁', desc: 'คลังเอกสาร PDF ย้อนหลัง' },
];

export default function RepairMenuPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <div className="rpr-shell">
      <header className="rpr-head">
        <button className="rpr-back" onClick={() => navigate('/hub')}>← กลับ</button>
        <h1>ระบบช่างประจำอาคาร</h1>
      </header>

      <div className="rpr-menu-grid">
        {TILES.map((t) => (
          <button
            key={t.key}
            type="button"
            className="rpr-tile"
            onClick={() => navigate(t.to)}
          >
            <div className="rpr-tile-emoji">{t.emoji}</div>
            <div className="rpr-tile-title">{t.title}</div>
            <div className="rpr-tile-desc">{t.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
