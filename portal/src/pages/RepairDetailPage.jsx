import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

// /repair/:jobId — detail + workflow transitions
//
// Workflow buttons depend on current status:
//   รอดำเนินการ      → [เริ่มซ่อม] [ส่งช่างนอก] [ยกเลิก]
//   กำลังดำเนินการ   → [ซ่อมเสร็จ] [ส่งช่างนอก] [ซ่อมไม่ได้]
//   รอช่างนอก / รออนุมัติ → [ซ่อมเสร็จ]
//   ดำเนินการสำเร็จ → [ปิดงาน]
//   ปิดงานแล้ว / ยกเลิก → (read-only)
//
// ซ่อมเสร็จ requires: assigned_to + repair_detail + ≥1 after_photo
// (gate enforced server-side in rpr_update_status).

const STATUS_PILL = {
  'รอดำเนินการ':     { bg: '#fef3c7', fg: '#92400e' },
  'กำลังดำเนินการ':  { bg: '#dbeafe', fg: '#1e40af' },
  'รออนุมัติ':        { bg: '#fce7f3', fg: '#9d174d' },
  'รอช่างนอก':        { bg: '#ede9fe', fg: '#5b21b6' },
  'ดำเนินการสำเร็จ': { bg: '#d1fae5', fg: '#065f46' },
  'ไม่สำเร็จ':         { bg: '#fee2e2', fg: '#991b1b' },
  'ปิดงานแล้ว':       { bg: '#e5e7eb', fg: '#374151' },
  'ยกเลิก':           { bg: '#fee2e2', fg: '#991b1b' },
};

export default function RepairDetailPage() {
  const { user } = useAuth();
  const { jobId } = useParams();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  // Edit-in-place for the "finish" flow
  const [assignedTo, setAssignedTo] = useState('');
  const [repairDetail, setRepairDetail] = useState('');
  const [afterPhotos, setAfterPhotos] = useState([]);  // [{url, name}]
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('rpr_get_job', { p_job_id: jobId });
      if (error) throw error;
      setJob(data);
      setAssignedTo(data?.assigned_to || user?.name || '');
      setRepairDetail(data?.repair_detail || '');
      setAfterPhotos((data?.after_photo_urls || []).map((url) => ({ url, name: url.split('/').pop() })));
    } catch (e) {
      setErr(e.message || 'โหลดไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [jobId]);

  const handlePhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    setErr(null);
    try {
      const out = [];
      for (const file of files) {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `repair-after/${jobId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('repair-attachments')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('repair-attachments').getPublicUrl(path);
        out.push({ url: pub.publicUrl, name: file.name });
      }
      setAfterPhotos((prev) => [...prev, ...out]);
    } catch (e) {
      setErr(e.message || 'อัพโหลดรูปไม่สำเร็จ');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removePhoto = (idx) => setAfterPhotos((prev) => prev.filter((_, i) => i !== idx));

  const transition = async (newStatus, extra = {}) => {
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase.rpc('rpr_update_status', {
        p_job_id: jobId,
        p_status: newStatus,
        p_assigned_to:       extra.assigned_to       ?? null,
        p_repair_detail:     extra.repair_detail     ?? null,
        p_after_photo_urls:  extra.after_photo_urls  ?? null,
        p_is_repairable:     extra.is_repairable     ?? null,
      });
      if (error) throw error;
      await load();
    } catch (e) {
      setErr(e.message || 'อัพเดทสถานะไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const start = () => transition('กำลังดำเนินการ', { assigned_to: assignedTo || user?.name });
  const sendOutside = () => transition('รอช่างนอก');
  const cancel = () => {
    if (!window.confirm('ยกเลิกใบนี้?')) return;
    transition('ยกเลิก');
  };
  const finish = () => transition('ดำเนินการสำเร็จ', {
    assigned_to: assignedTo,
    repair_detail: repairDetail,
    after_photo_urls: afterPhotos.map((p) => p.url),
    is_repairable: true,
  });
  const markUnrepairable = () => transition('ไม่สำเร็จ', {
    assigned_to: assignedTo,
    repair_detail: repairDetail || 'ไม่สามารถซ่อมได้',
    after_photo_urls: afterPhotos.map((p) => p.url),
    is_repairable: false,
  });
  const close = () => transition('ปิดงานแล้ว');

  const fmt = (s) => {
    if (!s) return '-';
    try {
      const d = new Date(s);
      return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
        + ' · ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    } catch { return s; }
  };

  if (!user) return null;
  if (loading) return <div className="rpr-shell"><div className="rpr-loading">กำลังโหลด…</div></div>;
  if (!job) return <div className="rpr-shell"><div className="rpr-empty">ไม่พบ {jobId}</div></div>;

  const status = job.status;
  const pill = STATUS_PILL[status] || { bg: '#f3f4f6', fg: '#374151' };
  const readOnly = status === 'ปิดงานแล้ว' || status === 'ยกเลิก';
  const canStart  = status === 'รอดำเนินการ';
  const canFinish = status === 'กำลังดำเนินการ' || status === 'รอช่างนอก' || status === 'รออนุมัติ';
  const canClose  = status === 'ดำเนินการสำเร็จ';

  return (
    <div className="rpr-shell">
      <header className="rpr-head">
        <button className="rpr-back" onClick={() => navigate('/repair')}>← กลับ</button>
        <h1>{job.job_id}</h1>
        <span className="rpr-pill" style={{ background: pill.bg, color: pill.fg }}>
          {status}
        </span>
      </header>

      {err && <div className="rpr-err">{err}</div>}

      {/* Summary card */}
      <section className="rpr-card-section">
        <div className="rpr-kv">
          <div><span>ผู้แจ้ง</span>{job.reporter_name || '-'} {job.reporter_dept && `(${job.reporter_dept})`}</div>
          <div><span>ประเภทบริการ</span>{job.service_type || '-'}</div>
          <div><span>ประเภทการซ่อม</span>{job.repair_type || '-'}</div>
          <div><span>รายการ</span>{job.item || '-'}</div>
          <div><span>ตำแหน่ง</span>{[job.floor, job.zone].filter(Boolean).join(' · ') || '-'}</div>
          <div><span>แจ้งเมื่อ</span>{fmt(job.reported_at)}</div>
          {job.opened_at && <div><span>เริ่มดำเนินการ</span>{fmt(job.opened_at)}</div>}
          {job.resolved_at && <div><span>สำเร็จเมื่อ</span>{fmt(job.resolved_at)}</div>}
          {job.assigned_to && <div><span>ผู้ซ่อม</span>{job.assigned_to}</div>}
        </div>
        {job.note && (
          <div className="rpr-note-block">
            <div className="rpr-note-label">รายละเอียดที่แจ้ง</div>
            <div className="rpr-note-body">{job.note}</div>
          </div>
        )}
        {job.repair_detail && (
          <div className="rpr-note-block">
            <div className="rpr-note-label">วิธีการแก้ไข</div>
            <div className="rpr-note-body">{job.repair_detail}</div>
          </div>
        )}
      </section>

      {/* Before photos */}
      {job.photo_urls?.length > 0 && (
        <section className="rpr-card-section">
          <h3>รูปก่อนซ่อม ({job.photo_urls.length})</h3>
          <div className="rpr-photo-grid">
            {job.photo_urls.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" /></a>)}
          </div>
        </section>
      )}

      {/* After photos — view (read-only when not editable) */}
      {job.after_photo_urls?.length > 0 && readOnly && (
        <section className="rpr-card-section">
          <h3>รูปหลังซ่อม ({job.after_photo_urls.length})</h3>
          <div className="rpr-photo-grid">
            {job.after_photo_urls.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" /></a>)}
          </div>
        </section>
      )}

      {/* Workflow editor — shown when actionable */}
      {!readOnly && (
        <section className="rpr-card-section">
          <h3>การดำเนินงาน</h3>

          <label className="bf-field">
            <span>ช่างผู้รับผิดชอบ</span>
            <input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="ชื่อช่าง" />
          </label>

          {(canFinish || status === 'กำลังดำเนินการ') && (
            <>
              <label className="bf-field">
                <span>วิธีการแก้ไข <b style={{ color: '#dc2626' }}>*จำเป็นถ้าจะปิดงาน</b></span>
                <textarea rows={4} value={repairDetail} onChange={(e) => setRepairDetail(e.target.value)}
                  placeholder="อธิบายขั้นตอนการแก้ไข อะไหล่ที่ใช้ ฯลฯ" />
              </label>

              <div className="bf-field">
                <span>รูปหลังซ่อม <b style={{ color: '#dc2626' }}>*จำเป็นถ้าจะปิดงาน</b></span>
                <div className="bf-photos">
                  {afterPhotos.map((p, i) => (
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
            </>
          )}

          <div className="rpr-actions">
            {canStart && (
              <>
                <button className="rpr-btn rpr-btn-go" onClick={start} disabled={busy}>▶ เริ่มซ่อม</button>
                <button className="rpr-btn rpr-btn-alt" onClick={sendOutside} disabled={busy}>🛠 ส่งช่างนอก</button>
                <button className="rpr-btn rpr-btn-cancel" onClick={cancel} disabled={busy}>ยกเลิก</button>
              </>
            )}
            {canFinish && (
              <>
                <button className="rpr-btn rpr-btn-go" onClick={finish} disabled={busy || uploading}>✓ ซ่อมเสร็จ</button>
                {status === 'กำลังดำเนินการ' && (
                  <>
                    <button className="rpr-btn rpr-btn-alt" onClick={sendOutside} disabled={busy}>🛠 ส่งช่างนอก</button>
                    <button className="rpr-btn rpr-btn-warn" onClick={markUnrepairable} disabled={busy}>✗ ซ่อมไม่ได้</button>
                  </>
                )}
              </>
            )}
            {canClose && (
              <button className="rpr-btn rpr-btn-go" onClick={close} disabled={busy}>📁 ปิดงาน</button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
