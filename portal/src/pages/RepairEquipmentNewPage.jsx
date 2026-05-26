import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

// /repair/equipment/new — add a new equipment master record. Stock_id
// is auto-generated if blank.

const CATEGORIES = ['Toilet', 'Lighting', 'Other'];

export default function RepairEquipmentNewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stockId, setStockId] = useState('');
  const [category, setCategory] = useState('Other');
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setErr(null);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `equipment/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from('repair-attachments')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data: pub } = supabase.storage.from('repair-attachments').getPublicUrl(path);
      setImageUrl(pub.publicUrl);
    } catch (e) { setErr(e.message); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const submit = async () => {
    if (!name.trim()) return setErr('ใส่ชื่ออุปกรณ์');
    setSubmitting(true); setErr(null);
    try {
      const { data, error } = await supabase.rpc('rpr_upsert_equipment', {
        p_stock_id: stockId.trim() || null,
        p_category: category,
        p_name: name.trim(),
        p_image_url: imageUrl || null,
      });
      if (error) throw error;
      navigate(`/repair/equipment/${data}`);
    } catch (e) { setErr(e.message); }
    finally { setSubmitting(false); }
  };

  if (!user) return null;

  return (
    <div className="rpr-shell">
      <header className="rpr-head">
        <button className="rpr-back" onClick={() => navigate('/repair/equipment')}>← กลับ</button>
        <h1>เพิ่มอุปกรณ์ใหม่</h1>
      </header>

      {err && <div className="rpr-err">{err}</div>}

      <section className="rpr-card-section">
        <label className="bf-field">
          <span>รหัสสต๊อก (เว้นว่างเพื่อ auto-generate)</span>
          <input value={stockId} onChange={(e) => setStockId(e.target.value)} placeholder="L2606010001" />
        </label>
        <label className="bf-field">
          <span>ลักษณะ *</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="bf-field">
          <span>ชื่อรายการ *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="bf-field">
          <span>รูปภาพ</span>
          {imageUrl ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <img src={imageUrl} alt="" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
              <button type="button" className="rpr-btn-x" onClick={() => setImageUrl('')}>ลบ</button>
            </div>
          ) : (
            <label className="bf-photo-add" style={{ width: 'auto', height: 'auto', padding: '10px 14px' }}>
              <input type="file" accept="image/*" onChange={handleImage} disabled={uploading} style={{ display: 'none' }} />
              <span>{uploading ? 'อัพโหลด…' : '＋ เลือกรูป'}</span>
            </label>
          )}
        </div>
      </section>

      <div className="rpr-actions">
        <button className="rpr-btn rpr-btn-cancel" onClick={() => navigate('/repair/equipment')} disabled={submitting}>ยกเลิก</button>
        <button className="rpr-btn rpr-btn-go" onClick={submit} disabled={submitting || uploading}>
          {submitting ? 'บันทึก…' : 'บันทึก'}
        </button>
      </div>
    </div>
  );
}
