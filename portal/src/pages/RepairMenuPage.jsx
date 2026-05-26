import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

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

  const [counts, setCounts] = useState({
    pending: 0, inProgress: 0, doneMonth: 0,
    factoryPending: 0, inspections: 0, equipment: 0, handovers: 0,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const [jc, fc, ic, ec, hc, dm] = await Promise.all([
          supabase.rpc('rpr_job_counts'),
          supabase.from('rpr_factory_requests').select('doc_no', { count: 'exact', head: true }).eq('status', 'รออนุมัติ'),
          supabase.from('rpr_inspections').select('irid', { count: 'exact', head: true }),
          supabase.from('rpr_equipment').select('stock_id', { count: 'exact', head: true }),
          supabase.from('rpr_handovers').select('doc_no', { count: 'exact', head: true }),
          supabase.from('rpr_jobs').select('job_id', { count: 'exact', head: true })
            .eq('status', 'ปิดงานแล้ว').gte('closed_at', monthStart.toISOString()),
        ]);
        if (cancelled) return;
        const jcRows = jc.data || [];
        const findN = (s) => Number(jcRows.find((r) => r.status === s)?.n || 0);
        setCounts({
          pending: findN('รอดำเนินการ'),
          inProgress: findN('กำลังดำเนินการ'),
          doneMonth: dm.count || 0,
          factoryPending: fc.count || 0,
          inspections: ic.count || 0,
          equipment: ec.count || 0,
          handovers: hc.count || 0,
        });
      } catch {
        // silently fall back to zeros — menu still works without stats
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!user) return null;

  const name = fullName(user);
  const dept = user.department || '';
  const code = user.employeeId || '';

  const badgeFor = (key) => {
    switch (key) {
      case 'jobs': return counts.pending + counts.inProgress > 0 ? `${counts.pending + counts.inProgress} งานเปิดอยู่` : null;
      case 'inspection': return counts.inspections > 0 ? `${counts.inspections} ใบ` : null;
      case 'equipment': return counts.equipment > 0 ? `${counts.equipment} รายการ` : null;
      case 'handover': return counts.handovers > 0 ? `${counts.handovers} ใบ` : null;
      case 'factory': return counts.factoryPending > 0 ? `${counts.factoryPending} รออนุมัติ` : null;
      default: return null;
    }
  };

  return (
    <div className="rpr-shell">
      <header className="rpr-head">
        <button className="rpr-back" onClick={() => navigate('/hub')}>← กลับ</button>
        <h1>ระบบช่างประจำอาคาร</h1>
      </header>

      <div className="rpr-hero">
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

        <div className="rpr-stats">
          <button type="button" className="rpr-stat"
            style={{ '--stat-color': '#f59e0b' }}
            onClick={() => navigate('/repair/jobs')}>
            <span className="rpr-stat-label">รอดำเนินการ</span>
            <span className="rpr-stat-num">{counts.pending}</span>
            <span className="rpr-stat-suf">งาน</span>
          </button>
          <button type="button" className="rpr-stat"
            style={{ '--stat-color': '#0891b2' }}
            onClick={() => navigate('/repair/jobs')}>
            <span className="rpr-stat-label">กำลังดำเนินการ</span>
            <span className="rpr-stat-num">{counts.inProgress}</span>
            <span className="rpr-stat-suf">งาน</span>
          </button>
          <button type="button" className="rpr-stat"
            style={{ '--stat-color': '#16a34a' }}
            onClick={() => navigate('/repair/jobs')}>
            <span className="rpr-stat-label">ปิดงานเดือนนี้</span>
            <span className="rpr-stat-num">{counts.doneMonth}</span>
            <span className="rpr-stat-suf">งาน</span>
          </button>
          <button type="button" className="rpr-stat"
            style={{ '--stat-color': '#db2777' }}
            onClick={() => navigate('/repair/factory-requests')}>
            <span className="rpr-stat-label">เบิกรออนุมัติ</span>
            <span className="rpr-stat-num">{counts.factoryPending}</span>
            <span className="rpr-stat-suf">ใบ</span>
          </button>
        </div>
      </div>

      <div className="rpr-menu-grid">
        {TILES.map((t) => {
          const badge = badgeFor(t.key);
          return (
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
              {badge && <span className="rpr-tile-badge">● {badge}</span>}
              <div className="rpr-tile-arrow">→</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
