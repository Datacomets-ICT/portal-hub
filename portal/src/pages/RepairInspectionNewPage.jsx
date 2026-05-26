import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

// /repair/inspections/new — monthly inspection form. Mirrors the
// legacy AppSheet form: type chip (น้ำ/ไฟ/ความปลอดภัย) + 4 photos.

const INSPECTION_TYPES = ['น้ำ', 'ไฟ', 'ความปลอดภัย'];

const ITEMS_BY_TYPE = {
  'น้ำ':           ['ก๊อกน้ำ', 'ฝักบัว', 'โถส้วม', 'อ่างล้างมือ', 'ท่อน้ำ', 'ปั๊มน้ำ', 'ถังเก็บน้ำ', 'อื่น ๆ'],
  'ไฟ':            ['หลอดไฟยาว', 'หลอดไฟกลม', 'ปลั๊กไฟ', 'สวิตช์ไฟ', 'โคมไฟ', 'ตู้ MDB', 'เครื่องสำรองไฟ', 'อื่น ๆ'],
  'ความปลอดภัย':   ['ถังดับเพลิง', 'สัญญาณเตือนภัย', 'กล้องวงจรปิด', 'เครื่องสแกนนิ้ว', 'ป้ายทางหนีไฟ', 'ไฟฉุกเฉิน', 'อื่น ๆ'],
};

const FLOORS = ['ชั้น1','ชั้น2','ชั้น3','ชั้น4','ชั้น5','ชั้น6','ชั้น7','ชั้น8'];

const ZONES = [
  'A', 'B', 'โซนAและ B',
  'ลานจอดรถ โซน A', 'ลานจอดรถ โซน B',
  'ห้องน้ำชายA', 'ห้องน้ำหญิงA', 'ห้องน้ำชายB', 'ห้องน้ำหญิงB',
  'ห้องอาหาร', 'RECEPTION', 'อื่น ๆ',
];

export default function RepairInspectionNewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ')
    || user?.nickname || user?.name || '';

  const [inspectorId, setInspectorId]   = useState(user?.employeeId || '');
  const [inspectorName, setInspectorName] = useState(fullName);
  const [dept, setDept]                 = useState(user?.department || '');
  const [inspectedAt, setInspectedAt]   = useState(new Date().toISOString().slice(0, 16));
  const [type, setType]                 = useState('');
  const [item, setItem]                 = useState('');
  const [itemOther, setItemOther]       = useState('');
  const [floor, setFloor]               = useState('');
  const [zone, setZone]                 = useState('');
  const [detail, setDetail]             = useState('');
  const [photos, setPhotos]             = useState([]);   // [{url, name}]

  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const itemList = ITEMS_BY_TYPE[type] || [];
  const finalItem = item === 'อื่น ๆ' ? itemOther.trim() : item;

  const handlePhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (photos.length + files.length > 4) {
      setErr('แนบรูปได้สูงสุด 4 รูป');
      return;
    }
    setUploading(true); setErr(null);
    try {
      const out = [];
      for (const file of files) {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `inspection/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('repair-attachments')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('repair-attachments').getPublicUrl(path);
        out.push({ url: pub.publicUrl, name: file.name });
      }
      setPhotos((p) => [...p, ...out]);
    } catch (e) {
      setErr(e.message || 'อัพโหลดรูปไม่สำเร็จ');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removePhoto = (i) => setPhotos((p) => p.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!inspectorId.trim()) return setErr('ใส่รหัสพนักงาน');
    if (!inspectorName.trim()) return setErr('ใส่ชื่อพนักงาน');
    if (!dept.trim()) return setErr('ใส่แผนก');
    if (!type) return setErr('เลือกประเภทการตรวจ');
    if (!floor) return setErr('เลือกชั้น');
    if (!zone) return setErr('เลือกโซน');

    setSubmitting(true); setErr(null);
    try {
      const { data, error } = await supabase.rpc('rpr_create_inspection', {
        p_inspector_id:    inspectorId.trim(),
        p_inspector_name:  inspectorName.trim(),
        p_dept:            dept.trim(),
        p_inspected_at:    inspectedAt ? new Date(inspectedAt).toISOString() : null,
        p_inspection_type: type,
        p_item:            finalItem || null,
        p_floor:           floor,
        p_zone:            zone,
        p_detail:          detail.trim() || null,
        p_photo_urls:      photos.length ? photos.map((p) => p.url) : null,
      });
      if (error) throw error;
      navigate('/repair/inspections');
    } catch (e) {
      setErr(e.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="rpr-shell">
      <header className="rpr-head">
        <button className="rpr-back" onClick={() => navigate('/repair/inspections')}>← กลับ</button>
        <h1>ใบตรวจประจำเดือน — ใหม่</h1>
      </header>

      {err && <div className="rpr-err">{err}</div>}

      <section className="rpr-card-section">
        <h3>ผู้ตรวจ</h3>
        <div className="rpr-form-grid">
          <label className="bf-field">
            <span>รหัสพนักงานที่ตรวจ *</span>
            <input value={inspectorId} onChange={(e) => setInspectorId(e.target.value)} />
          </label>
          <label className="bf-field">
            <span>ชื่อพนักงานที่ตรวจ *</span>
            <input value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} />
          </label>
          <label className="bf-field">
            <span>แผนก *</span>
            <input value={dept} onChange={(e) => setDept(e.target.value)} />
          </label>
          <label className="bf-field">
            <span>เวลาที่ตรวจ *</span>
            <input type="datetime-local" value={inspectedAt} onChange={(e) => setInspectedAt(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="rpr-card-section">
        <h3>รายละเอียดการตรวจ</h3>

        <div className="bf-field">
          <span>ประเภทการตรวจ *</span>
          <div className="rpr-chip-row">
            {INSPECTION_TYPES.map((t) => (
              <button key={t} type="button"
                className={`rpr-chip-btn ${type === t ? 'is-on' : ''}`}
                onClick={() => { setType(t); setItem(''); setItemOther(''); }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="rpr-form-grid">
          <label className="bf-field">
            <span>รายการที่ตรวจ</span>
            <select value={item} onChange={(e) => setItem(e.target.value)} disabled={!type}>
              <option value="">— {type ? 'เลือก' : 'เลือกประเภทก่อน'} —</option>
              {itemList.map((i) => <option key={i}>{i}</option>)}
            </select>
          </label>
          {item === 'อื่น ๆ' && (
            <label className="bf-field">
              <span>ระบุรายการ</span>
              <input value={itemOther} onChange={(e) => setItemOther(e.target.value)}
                placeholder="พิมพ์ชื่อรายการ" />
            </label>
          )}

          <label className="bf-field">
            <span>ชั้นที่ตรวจ *</span>
            <select value={floor} onChange={(e) => setFloor(e.target.value)}>
              <option value="">— เลือก —</option>
              {FLOORS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label className="bf-field">
            <span>โซนที่ตรวจ *</span>
            <select value={zone} onChange={(e) => setZone(e.target.value)}>
              <option value="">— เลือก —</option>
              {ZONES.map((z) => <option key={z}>{z}</option>)}
            </select>
          </label>
        </div>

        <label className="bf-field">
          <span>รายละเอียดการตรวจ</span>
          <textarea rows={3} value={detail} onChange={(e) => setDetail(e.target.value)}
            placeholder="บันทึกสิ่งที่พบ / ผลการตรวจ" />
        </label>

        <div className="bf-field">
          <span>รูปประจำเดือน — สูงสุด 4 รูป ({photos.length}/4)</span>
          <div className="bf-photos">
            {photos.map((p, i) => (
              <div key={i} className="bf-photo">
                <img src={p.url} alt={p.name} />
                <button type="button" className="bf-photo-x" onClick={() => removePhoto(i)}>✕</button>
              </div>
            ))}
            {photos.length < 4 && (
              <label className="bf-photo-add">
                <input type="file" accept="image/*" multiple onChange={handlePhotos}
                  disabled={uploading} style={{ display: 'none' }} />
                <span>{uploading ? 'กำลังอัพโหลด…' : '＋ เพิ่มรูป'}</span>
              </label>
            )}
          </div>
        </div>
      </section>

      <div className="rpr-actions">
        <button className="rpr-btn rpr-btn-cancel"
          onClick={() => navigate('/repair/inspections')} disabled={submitting}>
          ยกเลิก
        </button>
        <button className="rpr-btn rpr-btn-go"
          onClick={submit} disabled={submitting || uploading}>
          {submitting ? 'กำลังบันทึก…' : 'บันทึกการตรวจ'}
        </button>
      </div>
    </div>
  );
}
