import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

// /repair/handovers/new — create a handover doc + N items in one shot.

const ADDR_OPTIONS = ['Fac', 'ICT', 'อื่นๆ'];

export default function RepairHandoverNewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [deliveredAt, setDeliveredAt] = useState(new Date().toISOString().slice(0, 16));
  const [addr, setAddr] = useState('Fac');
  const [addrOther, setAddrOther] = useState('');
  const [sender, setSender] = useState(user?.name || '');
  const [recipient, setRecipient] = useState('');
  const [authorized, setAuthorized] = useState(user?.name || '');
  const [note, setNote] = useState('');
  const [items, setItems] = useState([{ item: '', quantity: '', unit: '', note: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const addItem = () => setItems((p) => [...p, { item: '', quantity: '', unit: '', note: '' }]);
  const updItem = (i, k, v) => setItems((p) => p.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  const delItem = (i) => setItems((p) => p.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!sender.trim()) return setErr('ใส่ชื่อผู้ส่ง');
    if (!recipient.trim()) return setErr('ใส่ชื่อผู้รับ');
    if (addr === 'อื่นๆ' && !addrOther.trim()) return setErr('ระบุที่อยู่ผู้รับ');
    const validItems = items.filter((it) => it.item?.trim());
    if (validItems.length === 0) return setErr('เพิ่มอย่างน้อย 1 รายการ');

    setSubmitting(true); setErr(null);
    try {
      const { data, error } = await supabase.rpc('rpr_create_handover', {
        p_delivered_at: deliveredAt ? new Date(deliveredAt).toISOString() : null,
        p_recipient_addr: addr,
        p_recipient_addr_other: addr === 'อื่นๆ' ? addrOther.trim() : null,
        p_sender: sender.trim(),
        p_recipient: recipient.trim(),
        p_authorized_person: authorized.trim() || null,
        p_note: note.trim() || null,
        p_items: validItems.map((it) => ({
          item: it.item.trim(),
          quantity: it.quantity || null,
          unit: it.unit || null,
          note: it.note || null,
        })),
      });
      if (error) throw error;
      navigate(`/repair/handovers/${data}`);
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
        <button className="rpr-back" onClick={() => navigate('/repair/handovers')}>← กลับ</button>
        <h1>ใบส่งมอบทรัพย์สิน — ใหม่</h1>
      </header>

      {err && <div className="rpr-err">{err}</div>}

      <section className="rpr-card-section">
        <h3>ข้อมูลเอกสาร</h3>
        <label className="bf-field">
          <span>วันที่ส่งมอบ</span>
          <input type="datetime-local" value={deliveredAt} onChange={(e) => setDeliveredAt(e.target.value)} />
        </label>
        <label className="bf-field">
          <span>ที่อยู่ผู้รับ</span>
          <select value={addr} onChange={(e) => setAddr(e.target.value)}>
            {ADDR_OPTIONS.map((a) => <option key={a}>{a}</option>)}
          </select>
        </label>
        {addr === 'อื่นๆ' && (
          <label className="bf-field">
            <span>ระบุที่อยู่</span>
            <input value={addrOther} onChange={(e) => setAddrOther(e.target.value)} />
          </label>
        )}
        <label className="bf-field">
          <span>ผู้ส่ง *</span>
          <input value={sender} onChange={(e) => setSender(e.target.value)} />
        </label>
        <label className="bf-field">
          <span>ผู้รับ *</span>
          <input value={recipient} onChange={(e) => setRecipient(e.target.value)} />
        </label>
        <label className="bf-field">
          <span>ผู้รับมอบอำนาจ</span>
          <input value={authorized} onChange={(e) => setAuthorized(e.target.value)} />
        </label>
        <label className="bf-field">
          <span>หมายเหตุ</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </section>

      <section className="rpr-card-section">
        <h3>รายการ ({items.length})</h3>
        {items.map((it, i) => (
          <div key={i} className="rpr-item-row">
            <input placeholder="ชื่อรายการ *" value={it.item} onChange={(e) => updItem(i, 'item', e.target.value)} style={{ flex: 2 }} />
            <input placeholder="จำนวน" type="number" value={it.quantity} onChange={(e) => updItem(i, 'quantity', e.target.value)} style={{ flex: 1 }} />
            <input placeholder="หน่วย" value={it.unit} onChange={(e) => updItem(i, 'unit', e.target.value)} style={{ flex: 1 }} />
            <input placeholder="หมายเหตุ" value={it.note} onChange={(e) => updItem(i, 'note', e.target.value)} style={{ flex: 2 }} />
            <button type="button" className="rpr-btn-x" onClick={() => delItem(i)}>✕</button>
          </div>
        ))}
        <button type="button" className="rpr-btn rpr-btn-cancel" onClick={addItem}>＋ เพิ่มรายการ</button>
      </section>

      <div className="rpr-actions">
        <button className="rpr-btn rpr-btn-cancel" onClick={() => navigate('/repair/handovers')} disabled={submitting}>ยกเลิก</button>
        <button className="rpr-btn rpr-btn-go" onClick={submit} disabled={submitting}>
          {submitting ? 'กำลังบันทึก…' : 'สร้างใบส่งมอบ'}
        </button>
      </div>
    </div>
  );
}
