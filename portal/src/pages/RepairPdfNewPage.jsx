import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

// /repair/pdf/new — upload up to 5 PDF kinds in one batch

const SLOTS = [
  { key: 'repair',     label: 'PDF ใบแจ้งซ่อม' },
  { key: 'withdrawal', label: 'PDF ใบเบิกอุปกรณ์' },
  { key: 'borrow',     label: 'PDF ใบขอยืมอุปกรณ์' },
  { key: 'return',     label: 'PDF ใบขอคืนอุปกรณ์' },
  { key: 'handover',   label: 'PDF ใบส่งมอบอุปกรณ์' },
];

export default function RepairPdfNewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [files, setFiles] = useState({});  // { repair: {url, name}, ... }
  const [uploading, setUploading] = useState(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const handle = async (key, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(key); setErr(null);
    try {
      const path = `pdf/${key}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
      const { error } = await supabase.storage
        .from('repair-attachments')
        .upload(path, file, { contentType: 'application/pdf', upsert: false });
      if (error) throw error;
      const { data: pub } = supabase.storage.from('repair-attachments').getPublicUrl(path);
      setFiles((p) => ({ ...p, [key]: { url: pub.publicUrl, name: file.name } }));
    } catch (e) { setErr(e.message); }
    finally { setUploading(null); e.target.value = ''; }
  };

  const remove = (key) => setFiles((p) => { const c = { ...p }; delete c[key]; return c; });

  const submit = async () => {
    if (Object.keys(files).length === 0) return setErr('อัพโหลด PDF อย่างน้อย 1 ไฟล์');
    setSubmitting(true); setErr(null);
    try {
      const { error } = await supabase.rpc('rpr_create_pdf_batch', {
        p_repair_url:     files.repair?.url     || null,
        p_withdrawal_url: files.withdrawal?.url || null,
        p_borrow_url:     files.borrow?.url     || null,
        p_return_url:     files.return?.url     || null,
        p_handover_url:   files.handover?.url   || null,
        p_note:           note.trim() || null,
      });
      if (error) throw error;
      navigate('/repair/pdf');
    } catch (e) { setErr(e.message); }
    finally { setSubmitting(false); }
  };

  if (!user) return null;

  return (
    <div className="rpr-shell">
      <header className="rpr-head">
        <button className="rpr-back" onClick={() => navigate('/repair/pdf')}>← กลับ</button>
        <h1>เก็บ PDF — batch ใหม่</h1>
      </header>

      {err && <div className="rpr-err">{err}</div>}

      <section className="rpr-card-section">
        <h3>อัพโหลด PDF (สูงสุด 5 ชนิด)</h3>
        {SLOTS.map((s) => (
          <div key={s.key} className="bf-field">
            <span>{s.label}</span>
            {files[s.key] ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <a href={files[s.key].url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-2)' }}>
                  📄 {files[s.key].name}
                </a>
                <button type="button" className="rpr-btn-x" onClick={() => remove(s.key)}>✕</button>
              </div>
            ) : (
              <label className="bf-photo-add" style={{ width: 'auto', height: 'auto', padding: '10px 14px' }}>
                <input type="file" accept="application/pdf"
                  onChange={(e) => handle(s.key, e)}
                  disabled={uploading === s.key}
                  style={{ display: 'none' }} />
                <span>{uploading === s.key ? 'กำลังอัพโหลด…' : `＋ เลือกไฟล์ ${s.label}`}</span>
              </label>
            )}
          </div>
        ))}

        <label className="bf-field">
          <span>หมายเหตุ</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </section>

      <div className="rpr-actions">
        <button className="rpr-btn rpr-btn-cancel" onClick={() => navigate('/repair/pdf')} disabled={submitting}>ยกเลิก</button>
        <button className="rpr-btn rpr-btn-go" onClick={submit} disabled={submitting || uploading}>
          {submitting ? 'กำลังบันทึก…' : 'บันทึก batch'}
        </button>
      </div>
    </div>
  );
}
