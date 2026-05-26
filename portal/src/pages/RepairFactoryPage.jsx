import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

// /repair/factory-requests — list of factory withdrawal requests.
// 4-stage workflow: รออนุมัติ → อนุมัติ → จ่ายแล้ว → รับแล้ว.

const PILL = {
  'รออนุมัติ': { bg: '#fef3c7', fg: '#92400e' },
  'อนุมัติ':    { bg: '#dbeafe', fg: '#1e40af' },
  'จ่ายแล้ว':  { bg: '#ede9fe', fg: '#5b21b6' },
  'รับแล้ว':   { bg: '#d1fae5', fg: '#065f46' },
  'ยกเลิก':    { bg: '#fee2e2', fg: '#991b1b' },
};

export default function RepairFactoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('rpr_factory_requests')
          .select('*')
          .order('request_date', { ascending: false, nullsFirst: false })
          .limit(200);
        if (error) throw error;
        setRows(data || []);
      } catch (e) { setErr(e.message); }
      finally { setLoading(false); }
    })();
  }, []);

  const fmt = (s) => s ? new Date(s).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

  if (!user) return null;

  return (
    <div className="rpr-shell">
      <header className="rpr-head">
        <button className="rpr-back" onClick={() => navigate('/repair')}>← เมนู</button>
        <h1>ใบขอเบิกอุปกรณ์จากโรงงาน</h1>
        <span className="rpr-sub">{rows.length} ใบ</span>
      </header>

      <div className="rpr-controls">
        <button type="button" className="rpr-new" onClick={() => navigate('/repair/factory-requests/new')}>
          ＋ สร้างคำขอใหม่
        </button>
      </div>

      {err && <div className="rpr-err">{err}</div>}

      {loading ? <div className="rpr-loading">กำลังโหลด…</div> :
       rows.length === 0 ? (
        <div className="rpr-empty">
          ยังไม่มีใบขอเบิก<br/>
          <small style={{ color: 'var(--ink-3)' }}>(ฟอร์มสร้างใบ + อนุมัติ → จ่าย → รับ — Phase 3.3)</small>
        </div>
      ) : (
        <div className="rpr-table-wrap">
          <table className="rpr-table">
            <thead><tr>
              <th>เลขที่</th><th>วันที่ขอ</th><th>ผู้ขอ</th><th>ผู้อนุมัติ</th>
              <th>ผู้จ่าย</th><th>ผู้รับ</th><th>สถานะ</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const p = PILL[r.status] || { bg: '#f3f4f6', fg: '#374151' };
                return (
                  <tr key={r.doc_no} onClick={() => navigate(`/repair/factory-requests/${r.doc_no}`)} style={{ cursor: 'pointer' }}>
                    <td className="rpr-td-id">{r.doc_no}</td>
                    <td className="rpr-td-dim">{fmt(r.request_date)}</td>
                    <td>{r.requester || '-'}</td>
                    <td>{r.approver || '-'}</td>
                    <td>{r.dispenser || '-'}</td>
                    <td>{r.receiver || '-'}</td>
                    <td><span className="rpr-pill" style={{ background: p.bg, color: p.fg }}>{r.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
