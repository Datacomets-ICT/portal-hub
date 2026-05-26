import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

// /repair/factory-requests/:docNo — view + advance workflow.
// Approve is CEO-only (system role) but the others are open to admins.
// Server-side guards enforce the status transitions either way.

const PILL = {
  'รออนุมัติ': { bg: '#fef3c7', fg: '#92400e' },
  'อนุมัติ':    { bg: '#dbeafe', fg: '#1e40af' },
  'จ่ายแล้ว':  { bg: '#ede9fe', fg: '#5b21b6' },
  'รับแล้ว':   { bg: '#d1fae5', fg: '#065f46' },
  'ยกเลิก':    { bg: '#fee2e2', fg: '#991b1b' },
};

export default function RepairFactoryDetailPage() {
  const { user } = useAuth();
  const { docNo } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('rpr_get_factory_request', { p_doc_no: docNo });
      if (error) throw error;
      setData(data?.[0] || null);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [docNo]);

  useEffect(() => { load(); }, [load]);

  const act = async (action) => {
    setBusy(true); setErr(null);
    try {
      const { error } = await supabase.rpc('rpr_update_factory_request', {
        p_doc_no: docNo, p_action: action, p_actor: user?.name || user?.code,
      });
      if (error) throw error;
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const fmt = (s) => s ? new Date(s).toLocaleString('th-TH') : '-';

  if (!user) return null;
  if (loading) return <div className="rpr-shell"><div className="rpr-loading">กำลังโหลด…</div></div>;
  if (!data?.doc) return <div className="rpr-shell"><div className="rpr-empty">ไม่พบ {docNo}</div></div>;

  const { doc, items } = data;
  const pill = PILL[doc.status] || { bg: '#f3f4f6', fg: '#374151' };

  return (
    <div className="rpr-shell">
      <header className="rpr-head">
        <button className="rpr-back" onClick={() => navigate('/repair/factory-requests')}>← กลับ</button>
        <h1>{doc.doc_no}</h1>
        <span className="rpr-pill" style={{ background: pill.bg, color: pill.fg }}>{doc.status}</span>
      </header>

      {err && <div className="rpr-err">{err}</div>}

      <section className="rpr-card-section">
        <h3>ข้อมูลคำขอ</h3>
        <div className="rpr-kv">
          <div><span>วันที่ขอ</span>{fmt(doc.request_date)}</div>
          <div><span>ผู้ขอ</span>{doc.requester || '-'}</div>
          <div><span>ผู้อนุมัติ</span>{doc.approver || '—'}</div>
          <div><span>ผู้จ่าย</span>{doc.dispenser || '—'}</div>
          <div><span>ผู้รับ</span>{doc.receiver || '—'}</div>
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
              <thead><tr><th>รายการ</th><th>จำนวน</th><th>หน่วย</th></tr></thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.item || '-'}</td>
                    <td>{it.quantity ?? '-'}</td>
                    <td className="rpr-td-dim">{it.unit || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rpr-card-section">
        <h3>การดำเนินการ</h3>
        <div className="rpr-actions">
          {doc.status === 'รออนุมัติ' && (
            <>
              <button className="rpr-btn rpr-btn-go" onClick={() => act('approve')} disabled={busy}>✓ อนุมัติ</button>
              <button className="rpr-btn rpr-btn-warn" onClick={() => act('reject')} disabled={busy}>✗ ไม่อนุมัติ</button>
            </>
          )}
          {doc.status === 'อนุมัติ' && (
            <button className="rpr-btn rpr-btn-go" onClick={() => act('dispense')} disabled={busy}>📦 จ่ายแล้ว</button>
          )}
          {doc.status === 'จ่ายแล้ว' && (
            <button className="rpr-btn rpr-btn-go" onClick={() => act('receive')} disabled={busy}>✓ รับแล้ว</button>
          )}
          {doc.status !== 'ยกเลิก' && doc.status !== 'รับแล้ว' && (
            <button className="rpr-btn rpr-btn-cancel" onClick={() => act('cancel')} disabled={busy}>ยกเลิก</button>
          )}
        </div>
      </section>
    </div>
  );
}
