import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

// /repair/factory-requests/new — request items from the factory.
// On submit, status = รออนุมัติ. CEO approves on the detail page.

export default function RepairFactoryNewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const defaultName = [user?.firstName, user?.lastName].filter(Boolean).join(' ')
    || user?.nickname || user?.name || '';

  const [requestDate, setRequestDate] = useState(new Date().toISOString().slice(0, 16));
  const [requester, setRequester] = useState(defaultName);
  const [approver, setApprover] = useState('');
  const [dispenser, setDispenser] = useState('');
  const [receiver, setReceiver] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState([{ item: '', quantity: '', unit: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const addItem = () => setItems((p) => [...p, { item: '', quantity: '', unit: '' }]);
  const updItem = (i, k, v) => setItems((p) => p.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  const delItem = (i) => setItems((p) => p.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!requester.trim()) return setErr('ใส่ชื่อผู้ขอเบิก');
    const validItems = items.filter((it) => it.item?.trim());
    if (validItems.length === 0) return setErr('เพิ่มอย่างน้อย 1 รายการ');

    setSubmitting(true); setErr(null);
    try {
      const { data, error } = await supabase.rpc('rpr_create_factory_request', {
        p_requester: requester.trim(),
        p_note: note.trim() || null,
        p_items: validItems.map((it) => ({
          item: it.item.trim(),
          quantity: it.quantity || null,
          unit: it.unit || null,
        })),
        p_request_date: requestDate ? new Date(requestDate).toISOString() : null,
        p_approver: approver.trim() || null,
        p_dispenser: dispenser.trim() || null,
        p_receiver: receiver.trim() || null,
      });
      if (error) throw error;
      navigate(`/repair/factory-requests/${data}`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="rpr-shell">
      <header className="rpr-head">
        <button className="rpr-back" onClick={() => navigate('/repair/factory-requests')}>← กลับ</button>
        <h1>ขอเบิกอุปกรณ์จากโรงงาน — ใหม่</h1>
      </header>

      {err && <div className="rpr-err">{err}</div>}

      <section className="rpr-card-section">
        <h3>ข้อมูลคำขอ</h3>
        <div className="rpr-form-grid">
          <label className="bf-field">
            <span>วันที่เบิก *</span>
            <input type="datetime-local" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} />
          </label>
          <label className="bf-field">
            <span>ผู้ขอเบิก *</span>
            <input value={requester} onChange={(e) => setRequester(e.target.value)} />
          </label>
          <label className="bf-field">
            <span>ผู้อนุมัติ <small style={{ color: 'var(--ink-3)' }}>(ใส่ได้ภายหลังตอนอนุมัติ)</small></span>
            <input value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="คุณจุ๋ม" />
          </label>
          <label className="bf-field">
            <span>ผู้จ่าย <small style={{ color: 'var(--ink-3)' }}>(ใส่ตอนจ่าย)</small></span>
            <input value={dispenser} onChange={(e) => setDispenser(e.target.value)} />
          </label>
          <label className="bf-field">
            <span>ผู้รับ <small style={{ color: 'var(--ink-3)' }}>(ใส่ตอนรับของ)</small></span>
            <input value={receiver} onChange={(e) => setReceiver(e.target.value)} />
          </label>
        </div>
        <label className="bf-field">
          <span>หมายเหตุ</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </section>

      <section className="rpr-card-section">
        <h3>รายการที่ขอเบิก ({items.length})</h3>
        {items.map((it, i) => (
          <div key={i} className="rpr-item-row">
            <input placeholder="รายการ *" value={it.item} onChange={(e) => updItem(i, 'item', e.target.value)} style={{ flex: 3 }} />
            <input placeholder="จำนวน" type="number" value={it.quantity} onChange={(e) => updItem(i, 'quantity', e.target.value)} style={{ flex: 1 }} />
            <input placeholder="หน่วย" value={it.unit} onChange={(e) => updItem(i, 'unit', e.target.value)} style={{ flex: 1 }} />
            <button type="button" className="rpr-btn-x" onClick={() => delItem(i)}>✕</button>
          </div>
        ))}
        <button type="button" className="rpr-btn rpr-btn-cancel" onClick={addItem}>＋ เพิ่มรายการ</button>
      </section>

      <div className="rpr-actions">
        <button className="rpr-btn rpr-btn-cancel" onClick={() => navigate('/repair/factory-requests')} disabled={submitting}>ยกเลิก</button>
        <button className="rpr-btn rpr-btn-go" onClick={submit} disabled={submitting}>
          {submitting ? 'กำลังบันทึก…' : 'ส่งคำขอ'}
        </button>
      </div>
    </div>
  );
}
