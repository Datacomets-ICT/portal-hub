import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

// /repair/new — create a new repair ticket
//
// Single-page form (no drill yet — that's a Phase 3 polish). Reporter
// is locked to currentUser (LINE OA flow will mint these too, but
// today an admin/ช่าง creates on behalf of the requester).

// Only shown when ประเภทบริการ = "ระบบ" — most ใบแจ้งซ่อม / ซ่อมทั่วไป
// don't need to subclassify by system, just go straight to item.
const REPAIR_TYPES = [
  'ปรับอากาศ', 'ปะปา(สุขาภิบาล)', 'ไฟฟ้า',
  'โครงสร้างหรือเฟอร์นิเจอร์', 'ความปลอดภัย', 'ตรวจประจำเดือน', 'อื่น ๆ',
];

// รายการ dropdown — common items grouped roughly by system. Picking
// "อื่น ๆ" reveals a text input so anything not on the list still works.
const COMMON_ITEMS = [
  'แอร์', 'น้ำหยดจากแอร์', 'รีโมทแอร์',
  'หลอดไฟยาว', 'หลอดไฟกลม', 'โคมไฟ', 'ปลั๊กไฟ', 'สวิตช์ไฟ',
  'ก๊อกน้ำ', 'ฝักบัว', 'โถส้วม', 'อ่างล้างมือ', 'ท่อน้ำ',
  'ประตู', 'หน้าต่าง', 'บานพับ', 'กลอน', 'กุญแจ',
  'โต๊ะ', 'เก้าอี้', 'ตู้', 'ฝ้าเพดาน', 'ผนัง', 'พื้น',
  'กล้องวงจรปิด', 'เครื่องสแกนนิ้ว', 'สัญญาณเตือนภัย',
  'อื่น ๆ',
];

const FLOORS = ['ชั้น1','ชั้น2','ชั้น3','ชั้น4','ชั้น5','ชั้น6','ชั้น7','ชั้น8'];

const ZONES = [
  'A', 'B', 'โซนAและ B',
  'ลานจอดรถ โซน A', 'ลานจอดรถ โซน B',
  'ห้องน้ำชายA', 'ห้องน้ำหญิงA', 'ห้องน้ำชายB', 'ห้องน้ำหญิงB',
  'ห้องอาหาร', 'RECEPTION', 'อื่น ๆ',
];

export default function RepairNewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [serviceType, setServiceType] = useState('ใบแจ้งซ่อม');
  const [repairType, setRepairType] = useState('');
  const [item, setItem] = useState('');
  const [itemOther, setItemOther] = useState('');
  const [floor, setFloor] = useState('');
  const [zone, setZone] = useState('');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]);

  const needsRepairType = serviceType === 'ระบบ';
  const finalItem = item === 'อื่น ๆ' ? itemOther.trim() : item;

  const reporterFullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ')
    || user?.nickname || user?.name || '';
  const [reporterId, setReporterId] = useState(user?.employeeId || user?.code || '');
  const [reporterName, setReporterName] = useState(reporterFullName);
  const [reporterDept, setReporterDept] = useState(user?.department || user?.dept || '');

  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const handlePhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    setErr(null);
    try {
      const out = [];
      for (const file of files) {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `repair-before/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('repair-attachments')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('repair-attachments').getPublicUrl(path);
        out.push({ url: pub.publicUrl, name: file.name });
      }
      setPhotos((prev) => [...prev, ...out]);
    } catch (e) {
      setErr(e.message || 'อัพโหลดรูปไม่สำเร็จ');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removePhoto = (idx) => setPhotos((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (needsRepairType && !repairType) { setErr('เลือกประเภทการซ่อม'); return; }
    if (!finalItem) { setErr('เลือก/ระบุรายการ'); return; }
    if (!floor) { setErr('เลือกชั้น'); return; }
    if (!note.trim()) { setErr('ใส่รายละเอียด'); return; }

    setSubmitting(true);
    setErr(null);
    try {
      const { data, error } = await supabase.rpc('rpr_create_job', {
        p_reporter_id:   reporterId || null,
        p_reporter_name: reporterName || '-',
        p_reporter_dept: reporterDept || null,
        p_service_type:  serviceType,
        p_repair_type:   needsRepairType ? repairType : null,
        p_item:          finalItem,
        p_floor:         floor,
        p_zone:          zone || null,
        p_note:          note.trim(),
        p_photo_urls:    photos.length ? photos.map((p) => p.url) : null,
      });
      if (error) throw error;
      navigate(`/repair/${data}`);
    } catch (e) {
      setErr(e.message || 'แจ้งซ่อมไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="rpr-shell">
      <header className="rpr-head">
        <button className="rpr-back" onClick={() => navigate('/repair')}>← กลับ</button>
        <h1>แจ้งซ่อมใหม่</h1>
      </header>

      {err && <div className="rpr-err">{err}</div>}

      <section className="rpr-card-section">
        <h3>ผู้แจ้ง</h3>
        <div className="rpr-kv">
          <div><span>รหัส</span>{reporterId || '-'}</div>
          <div><span>ชื่อ</span>{reporterName || '-'}</div>
          <div><span>แผนก</span>{reporterDept || '-'}</div>
        </div>
      </section>

      <section className="rpr-card-section">
        <h3>รายละเอียดงาน</h3>

        <div className="rpr-form-grid">
          <label className="bf-field">
            <span>ประเภทบริการ</span>
            <select value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
              <option>ใบแจ้งซ่อม</option>
              <option>ซ่อมทั่วไป</option>
              <option>ระบบ</option>
            </select>
          </label>

          {needsRepairType && (
            <label className="bf-field">
              <span>ประเภทการซ่อม *</span>
              <select value={repairType} onChange={(e) => setRepairType(e.target.value)}>
                <option value="">— เลือก —</option>
                {REPAIR_TYPES.map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>
          )}

          <label className="bf-field">
            <span>รายการ * (อุปกรณ์ / จุดที่ซ่อม)</span>
            <select value={item} onChange={(e) => setItem(e.target.value)}>
              <option value="">— เลือก —</option>
              {COMMON_ITEMS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>

          {item === 'อื่น ๆ' && (
            <label className="bf-field">
              <span>ระบุรายการ *</span>
              <input value={itemOther} onChange={(e) => setItemOther(e.target.value)}
                placeholder="พิมพ์ชื่อรายการ" />
            </label>
          )}

          <label className="bf-field">
            <span>ชั้น *</span>
            <select value={floor} onChange={(e) => setFloor(e.target.value)}>
              <option value="">— เลือก —</option>
              {FLOORS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>

          <label className="bf-field">
            <span>โซน / ตำแหน่ง</span>
            <select value={zone} onChange={(e) => setZone(e.target.value)}>
              <option value="">— เลือก —</option>
              {ZONES.map((z) => <option key={z}>{z}</option>)}
            </select>
          </label>
        </div>

        <label className="bf-field">
          <span>รายละเอียดปัญหา *</span>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="อธิบายปัญหาที่พบ ตำแหน่งเฉพาะ ฯลฯ" />
        </label>

        <div className="bf-field">
          <span>รูปภาพ (ก่อนซ่อม) — ติดได้หลายรูป</span>
          <div className="bf-photos">
            {photos.map((p, i) => (
              <div key={i} className="bf-photo">
                <img src={p.url} alt={p.name} />
                <button type="button" className="bf-photo-x" onClick={() => removePhoto(i)}>✕</button>
              </div>
            ))}
            <label className="bf-photo-add">
              <input type="file" accept="image/*" multiple onChange={handlePhotos}
                disabled={uploading} style={{ display: 'none' }} />
              <span>{uploading ? 'กำลังอัพโหลด…' : '＋ เพิ่มรูป'}</span>
            </label>
          </div>
        </div>

        <div className="rpr-actions">
          <button className="rpr-btn rpr-btn-cancel" onClick={() => navigate('/repair')} disabled={submitting}>
            ยกเลิก
          </button>
          <button className="rpr-btn rpr-btn-go" onClick={submit} disabled={submitting || uploading}>
            {submitting ? 'กำลังบันทึก…' : 'แจ้งซ่อม'}
          </button>
        </div>
      </section>
    </div>
  );
}
