import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

// Employee Directory — searchable list of all active employees with
// their current status pill. Reads list_active_employees() which
// already filters out resigned + unapproved rows.

export default function DirectoryPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [dept, setDept] = useState('all');
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('list_active_employees');
        if (!alive) return;
        if (error) throw error;
        setRows(data || []);
      } catch (err) {
        console.warn('directory load failed:', err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Distinct department list for the filter dropdown
  const departments = useMemo(() => {
    const s = new Set();
    rows.forEach((r) => r.department && s.add(r.department));
    return Array.from(s).sort();
  }, [rows]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((r) => {
      if (dept !== 'all' && r.department !== dept) return false;
      if (!q) return true;
      const hay = [
        r.employee_id,
        r.first_name,
        r.last_name,
        r.nickname,
        r.email,
        r.phone,
        r.department,
        r.section,
        r.job_position,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, filter, dept]);

  return (
    <div className="dir-shell">
      <header className="dir-head">
        <button className="dir-back" onClick={() => navigate('/hub')}>
          ← กลับ
        </button>
        <h1>เพื่อนร่วมงาน</h1>
        <span className="dir-sub">{rows.length} คน</span>
      </header>

      <div className="dir-controls">
        <input
          className="dir-search"
          placeholder="ค้นหา ชื่อ / รหัส / แผนก / ตำแหน่ง..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select
          className="dir-filter"
          value={dept}
          onChange={(e) => setDept(e.target.value)}
        >
          <option value="all">ทุกแผนก</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="dir-loading">กำลังโหลด…</div>
      ) : visible.length === 0 ? (
        <div className="dir-empty">ไม่พบเพื่อนร่วมงานที่ตรงกับเงื่อนไข</div>
      ) : (
        <div className="dir-grid">
          {visible.map((r) => (
            <PersonCard
              key={r.employee_id}
              row={r}
              expanded={openId === r.employee_id}
              onToggle={() => setOpenId(openId === r.employee_id ? null : r.employee_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PersonCard({ row: r, expanded, onToggle }) {
  const fullName =
    [r.first_name, r.last_name].filter(Boolean).join(' ') || r.nickname || r.employee_id;
  const subtitle = [r.department, r.section, r.job_position].filter(Boolean).join(' · ');
  const initial = (r.nickname || r.first_name || r.employee_id || '?').charAt(0).toUpperCase();
  const hasStatus = !!(r.status_emoji || r.status_text);

  return (
    <article
      className={`dir-card ${expanded ? 'is-open' : ''}`}
      onClick={onToggle}
    >
      <div className="dir-card-top">
        <div className="dir-avatar">
          {r.avatar_url ? (
            <img src={r.avatar_url} alt={fullName} />
          ) : (
            <span>{initial}</span>
          )}
        </div>
        <div className="dir-name-block">
          <div className="dir-name">
            {fullName}
            {r.nickname && r.nickname !== r.first_name && (
              <span className="dir-nick"> ({r.nickname})</span>
            )}
          </div>
          {subtitle && <div className="dir-sub-line">{subtitle}</div>}
        </div>
        {hasStatus && (
          <div className="dir-status">
            <span className="dir-status-emoji">{r.status_emoji || '💬'}</span>
            <span className="dir-status-text">{r.status_text || ''}</span>
          </div>
        )}
      </div>

      {expanded && (
        <div className="dir-detail">
          <div className="dir-detail-row">
            <span className="dir-label">รหัส</span>
            <span className="dir-value mono">{r.employee_id}</span>
          </div>
          {r.company && (
            <div className="dir-detail-row">
              <span className="dir-label">บริษัท</span>
              <span className="dir-value">{r.company}</span>
            </div>
          )}
          {r.email && (
            <div className="dir-detail-row">
              <span className="dir-label">Email</span>
              <a className="dir-value link" href={`mailto:${r.email}`} onClick={(e) => e.stopPropagation()}>
                {r.email}
              </a>
            </div>
          )}
          {r.phone && (
            <div className="dir-detail-row">
              <span className="dir-label">โทร</span>
              <a className="dir-value link mono" href={`tel:${r.phone}`} onClick={(e) => e.stopPropagation()}>
                {r.phone}
              </a>
            </div>
          )}
          {r.line_id && (
            <div className="dir-detail-row">
              <span className="dir-label">LINE</span>
              <span className="dir-value mono">{r.line_id}</span>
            </div>
          )}
          <div className="dir-detail-actions">
            {r.email && (
              <a className="dir-act dir-act-mail" href={`mailto:${r.email}`} onClick={(e) => e.stopPropagation()}>
                ส่ง Email
              </a>
            )}
            {r.phone && (
              <a className="dir-act dir-act-call" href={`tel:${r.phone}`} onClick={(e) => e.stopPropagation()}>
                โทร
              </a>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
