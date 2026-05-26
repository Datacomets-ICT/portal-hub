import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

// /repair/equipment — stock master. Empty until ทีมช่าง imports
// อุปกรณ์ sheet (998 rows) — that's the next migration after this
// commit ships.

export default function RepairEquipmentPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.rpc('rpr_list_equipment', { p_limit: 500 });
        if (error) throw error;
        setRows(data || []);
      } catch (e) { setErr(e.message); }
      finally { setLoading(false); }
    })();
  }, []);

  const categories = useMemo(() => {
    const s = new Set();
    rows.forEach((r) => r.category && s.add(r.category));
    return Array.from(s).sort();
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (cat !== 'all' && r.category !== cat) return false;
      if (!q) return true;
      return [r.stock_id, r.name, r.category].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [rows, search, cat]);

  if (!user) return null;

  return (
    <div className="rpr-shell">
      <header className="rpr-head">
        <button className="rpr-back" onClick={() => navigate('/repair')}>← เมนู</button>
        <h1>อุปกรณ์ / สต๊อก</h1>
        <span className="rpr-sub">{rows.length} รายการ</span>
      </header>

      <div className="rpr-chips">
        <button type="button" className={`rpr-chip ${cat === 'all' ? 'rpr-chip--on' : ''}`} onClick={() => setCat('all')}>
          ทั้งหมด<span className="rpr-chip-n">{rows.length}</span>
        </button>
        {categories.map((c) => {
          const n = rows.filter((r) => r.category === c).length;
          return (
            <button key={c} type="button"
              className={`rpr-chip ${cat === c ? 'rpr-chip--on' : ''}`}
              onClick={() => setCat(c)}>
              {c}<span className="rpr-chip-n">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="rpr-controls">
        <input className="rpr-search" placeholder="ค้นหา รหัส / ชื่อ..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <button type="button" className="rpr-new" onClick={() => navigate('/repair/equipment/new')}>
          ＋ เพิ่มอุปกรณ์
        </button>
      </div>

      {err && <div className="rpr-err">{err}</div>}

      {loading ? <div className="rpr-loading">กำลังโหลด…</div> :
       rows.length === 0 ? (
        <div className="rpr-empty">
          ยังไม่มีข้อมูลอุปกรณ์ — ต้อง import จาก xlsx ก่อน<br/>
          <small style={{ color: 'var(--ink-3)' }}>(998 รายการพร้อม import — ขั้นตอน Phase 3.1)</small>
        </div>
      ) : visible.length === 0 ? <div className="rpr-empty">ไม่พบในเงื่อนไขนี้</div> : (
        <div className="rpr-table-wrap">
          <table className="rpr-table">
            <thead><tr>
              <th>รหัส</th><th>ลักษณะ</th><th>รายการ</th><th>คงเหลือ</th>
            </tr></thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.stock_id} onClick={() => navigate(`/repair/equipment/${r.stock_id}`)} style={{ cursor: 'pointer' }}>
                  <td className="rpr-td-id">{r.stock_id}</td>
                  <td className="rpr-td-dim">{r.category || '-'}</td>
                  <td>{r.name || '-'}</td>
                  <td><strong>{r.quantity_on_hand ?? 0}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
