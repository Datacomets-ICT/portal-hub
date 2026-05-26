import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

// /repair/pdf — archive of PDFs (เก็บ PDF). One row per import batch,
// each holding up to 5 PDF kinds (repair / withdrawal / borrow / return
// / handover).

const PDF_KINDS = [
  { key: 'pdf_repair_url',     label: 'ใบแจ้งซ่อม' },
  { key: 'pdf_withdrawal_url', label: 'ใบเบิกอุปกรณ์' },
  { key: 'pdf_borrow_url',     label: 'ใบขอยืมอุปกรณ์' },
  { key: 'pdf_return_url',     label: 'ใบขอคืนอุปกรณ์' },
  { key: 'pdf_handover_url',   label: 'ใบส่งมอบอุปกรณ์' },
];

export default function RepairPdfPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('rpr_pdf_archive')
          .select('*')
          .order('imported_at', { ascending: false })
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
        <h1>เก็บ PDF</h1>
        <span className="rpr-sub">{rows.length} batch</span>
      </header>

      <div className="rpr-controls">
        <button type="button" className="rpr-new" onClick={() => navigate('/repair/pdf/new')}>
          ＋ อัพ PDF batch ใหม่
        </button>
      </div>

      {err && <div className="rpr-err">{err}</div>}

      {loading ? <div className="rpr-loading">กำลังโหลด…</div> :
       rows.length === 0 ? (
        <div className="rpr-empty">
          ยังไม่มี PDF<br/>
          <small style={{ color: 'var(--ink-3)' }}>(ฟอร์มอัพโหลด PDF ทั้ง 5 ประเภท — Phase 3.4)</small>
        </div>
      ) : (
        <div className="rpr-table-wrap">
          <table className="rpr-table">
            <thead><tr>
              <th>วันที่นำเข้า</th>
              {PDF_KINDS.map((k) => <th key={k.key}>{k.label}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="rpr-td-dim">{fmt(r.imported_at)}</td>
                  {PDF_KINDS.map((k) => (
                    <td key={k.key}>
                      {r[k.key] ? (
                        <a href={r[k.key]} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-2)' }}>📄 เปิด</a>
                      ) : <span className="rpr-td-dim">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
