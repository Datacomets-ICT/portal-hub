import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

// /repair/handovers — list of asset handover docs (rpr_handovers).
// Read-only list for now; create form is Phase 3.2.

export default function RepairHandoversPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('rpr_handovers')
          .select('*')
          .order('delivered_at', { ascending: false, nullsFirst: false })
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
        <h1>เอกสารส่งมอบทรัพย์สิน</h1>
        <span className="rpr-sub">{rows.length} เอกสาร</span>
      </header>

      {err && <div className="rpr-err">{err}</div>}

      {loading ? <div className="rpr-loading">กำลังโหลด…</div> :
       rows.length === 0 ? (
        <div className="rpr-empty">
          ยังไม่มีเอกสาร — สร้างใบใหม่ได้ใน Phase 3.2<br/>
          <small style={{ color: 'var(--ink-3)' }}>(ใน xlsx เดิมมี 987 ใบรอ import)</small>
        </div>
      ) : (
        <div className="rpr-table-wrap">
          <table className="rpr-table">
            <thead><tr>
              <th>เลขที่</th><th>วันที่ส่ง</th><th>ผู้ส่ง</th><th>ผู้รับ</th>
              <th>ที่อยู่</th><th>ผู้รับมอบอำนาจ</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.doc_no}>
                  <td className="rpr-td-id">{r.doc_no}</td>
                  <td className="rpr-td-dim">{fmt(r.delivered_at)}</td>
                  <td>{r.sender || '-'}</td>
                  <td>{r.recipient || '-'}</td>
                  <td className="rpr-td-dim">{r.recipient_addr || r.recipient_addr_other || '-'}</td>
                  <td className="rpr-td-dim">{r.authorized_person || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
