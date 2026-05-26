import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

// /repair/handovers/:docNo — read-only view of one handover + items

export default function RepairHandoverDetailPage() {
  const { user } = useAuth();
  const { docNo } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.rpc('rpr_get_handover', { p_doc_no: docNo });
        if (error) throw error;
        setData(data?.[0] || null);
      } catch (e) { setErr(e.message); }
      finally { setLoading(false); }
    })();
  }, [docNo]);

  const fmt = (s) => s ? new Date(s).toLocaleString('th-TH') : '-';

  if (!user) return null;
  if (loading) return <div className="rpr-shell"><div className="rpr-loading">กำลังโหลด…</div></div>;
  if (!data?.doc) return <div className="rpr-shell"><div className="rpr-empty">ไม่พบ {docNo}</div></div>;

  const { doc, items } = data;

  return (
    <div className="rpr-shell">
      <header className="rpr-head">
        <button className="rpr-back" onClick={() => navigate('/repair/handovers')}>← กลับ</button>
        <h1>{doc.doc_no}</h1>
      </header>

      {err && <div className="rpr-err">{err}</div>}

      <section className="rpr-card-section">
        <h3>ข้อมูลเอกสาร</h3>
        <div className="rpr-kv">
          <div><span>วันที่ส่งมอบ</span>{fmt(doc.delivered_at)}</div>
          <div><span>ที่อยู่ผู้รับ</span>{doc.recipient_addr || '-'}{doc.recipient_addr_other ? ` (${doc.recipient_addr_other})` : ''}</div>
          <div><span>ผู้ส่ง</span>{doc.sender || '-'}</div>
          <div><span>ผู้รับ</span>{doc.recipient || '-'}</div>
          <div><span>ผู้รับมอบอำนาจ</span>{doc.authorized_person || '-'}</div>
          <div><span>วันที่สร้าง</span>{fmt(doc.created_at)}</div>
        </div>
        {doc.note && (
          <div className="rpr-note-block">
            <div className="rpr-note-label">หมายเหตุ</div>
            <div className="rpr-note-body">{doc.note}</div>
          </div>
        )}
      </section>

      <section className="rpr-card-section">
        <h3>รายการ ({items?.length || 0})</h3>
        {!items?.length ? <div className="rpr-empty">ไม่มีรายการ</div> : (
          <div className="rpr-table-wrap">
            <table className="rpr-table">
              <thead><tr><th>รายการ</th><th>จำนวน</th><th>หน่วย</th><th>หมายเหตุ</th></tr></thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.item || '-'}</td>
                    <td>{it.quantity ?? '-'}</td>
                    <td className="rpr-td-dim">{it.unit || '-'}</td>
                    <td className="rpr-td-dim">{it.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
