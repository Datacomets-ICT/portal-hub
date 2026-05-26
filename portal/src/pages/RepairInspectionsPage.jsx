import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

// /repair/inspections — list of monthly inspections. Read-only for now;
// inspectors create them via the legacy app until we wire the form here.

const TYPE_COLOR = {
  'น้ำ':              { bg: '#dbeafe', fg: '#1e40af' },
  'ไฟ':               { bg: '#fef3c7', fg: '#92400e' },
  'ความปลอดภัย':      { bg: '#fee2e2', fg: '#991b1b' },
  'ใบตรวจประจำเดือน': { bg: '#e5e7eb', fg: '#374151' },
};

export default function RepairInspectionsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.rpc('rpr_list_inspections', { p_limit: 200 });
        if (error) throw error;
        setRows(data || []);
      } catch (e) { setErr(e.message); }
      finally { setLoading(false); }
    })();
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.irid, r.inspector_name, r.inspection_type, r.item, r.floor, r.zone, r.detail]
      .filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [rows, search]);

  const fmt = (s) => s ? new Date(s).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

  if (!user) return null;

  return (
    <div className="rpr-shell">
      <header className="rpr-head">
        <button className="rpr-back" onClick={() => navigate('/repair')}>← เมนู</button>
        <h1>ใบตรวจประจำเดือน</h1>
        <span className="rpr-sub">{rows.length} ใบ</span>
      </header>

      <div className="rpr-controls">
        <input className="rpr-search" placeholder="ค้นหา IRID / ผู้ตรวจ / รายการ..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <button type="button" className="rpr-new" onClick={() => navigate('/repair/inspections/new')}>
          ＋ ตรวจใหม่
        </button>
      </div>

      {err && <div className="rpr-err">{err}</div>}

      {loading ? <div className="rpr-loading">กำลังโหลด…</div> :
       visible.length === 0 ? <div className="rpr-empty">ไม่พบใบตรวจ</div> : (
        <div className="rpr-table-wrap">
          <table className="rpr-table">
            <thead><tr>
              <th>IRID</th><th>ผู้ตรวจ</th><th>ประเภท</th><th>รายการ</th>
              <th>ตำแหน่ง</th><th>ตรวจเมื่อ</th>
            </tr></thead>
            <tbody>
              {visible.map((r) => {
                const tc = TYPE_COLOR[r.inspection_type] || { bg: '#f3f4f6', fg: '#374151' };
                return (
                  <tr key={r.irid}>
                    <td className="rpr-td-id">{r.irid}</td>
                    <td>{r.inspector_name || '-'}</td>
                    <td>
                      {r.inspection_type && (
                        <span className="rpr-pill" style={{ background: tc.bg, color: tc.fg }}>
                          {r.inspection_type}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="rpr-issue">{r.item || '-'}</div>
                      {r.detail && <div className="rpr-issue-sub" style={{ maxWidth: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.detail}</div>}
                    </td>
                    <td className="rpr-td-dim">{[r.floor, r.zone].filter(Boolean).join(' · ') || '-'}</td>
                    <td className="rpr-td-dim">{fmt(r.inspected_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="rpr-table-foot">แสดง {visible.length} จาก {rows.length} รายการ</div>
        </div>
      )}
    </div>
  );
}
