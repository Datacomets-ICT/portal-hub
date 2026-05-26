import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

// IT Admin "ticket backfill" page — for walk-up / phone-call requests
// where the user didn't open a ticket themselves.
//
// Flow:
//   1. Drill into worklist (job_type → issue_type → symptom)
//      • each level has an "อื่น ๆ ระบุเอง" escape hatch
//      • picking at any level past job_type opens the form
//   2. Form: requester empId + handler empId + status + (photo)
//      • default status = "กำลังดำเนินการ"
//      • if status = "ดำเนินการเรียบร้อย" or "ปิดงานแล้ว" → photo REQUIRED
//   3. Submit → it_backfill_ticket RPC → returns ticket_no → toast

const COMPLETED_STATUSES = new Set([
  'ดำเนินการเรียบร้อย',
  'ปิดงานแล้ว',
]);

export default function BackfillPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const isItAdmin = useMemo(() => {
    if (!user) return false;
    return user.role === 'system' || user.isAdmin === true || user.itRole === 'admin';
  }, [user]);

  useEffect(() => {
    if (user && !isItAdmin) navigate('/hub', { replace: true });
  }, [user, isItAdmin, navigate]);

  // ── worklist data
  const [worklist, setWorklist] = useState([]);   // [{job_type, issue_type, symptom}]
  const [loading, setLoading] = useState(true);

  // ── drill state
  const [picked, setPicked] = useState({ job_type: null, issue_type: null });
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState(null);          // { job_type, issue_type, symptom } once chosen
  const [toast, setToast] = useState(null);

  const showToast = (msg, kind = 'ok') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!isItAdmin) return;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('worklist')
          .select('job_type, issue_type, symptom')
          .order('job_type')
          .order('issue_type', { nullsFirst: false })
          .order('symptom', { nullsFirst: false });
        if (error) throw error;
        setWorklist(data || []);
      } catch (err) {
        showToast(err.message || 'โหลด worklist ไม่สำเร็จ', 'err');
      } finally {
        setLoading(false);
      }
    })();
  }, [isItAdmin]);

  // ── derive current level's items from worklist + picked state
  const currentLevel = picked.job_type == null
    ? 'job_type'
    : picked.issue_type == null
      ? 'issue_type'
      : 'symptom';

  const items = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (currentLevel === 'job_type') {
      const set = new Set();
      worklist.forEach((w) => w.job_type && set.add(w.job_type));
      const arr = Array.from(set).sort();
      return q ? arr.filter((v) => v.toLowerCase().includes(q)) : arr;
    }
    if (currentLevel === 'issue_type') {
      const set = new Set();
      worklist
        .filter((w) => w.job_type === picked.job_type)
        .forEach((w) => w.issue_type && set.add(w.issue_type));
      const arr = Array.from(set).sort();
      return q ? arr.filter((v) => v.toLowerCase().includes(q)) : arr;
    }
    // symptom level
    const set = new Set();
    worklist
      .filter((w) => w.job_type === picked.job_type && w.issue_type === picked.issue_type)
      .forEach((w) => w.symptom && set.add(w.symptom));
    const arr = Array.from(set).sort();
    return q ? arr.filter((v) => v.toLowerCase().includes(q)) : arr;
  }, [worklist, picked, filter, currentLevel]);

  const goBack = () => {
    setFilter('');
    if (picked.issue_type != null) setPicked({ ...picked, issue_type: null });
    else if (picked.job_type != null) setPicked({ job_type: null, issue_type: null });
  };

  const pick = (value) => {
    setFilter('');
    if (currentLevel === 'job_type') {
      setPicked({ job_type: value, issue_type: null });
    } else if (currentLevel === 'issue_type') {
      // Check if any row in this (job, issue) combo has a symptom — if
      // not, jump straight to form (no level 3 needed).
      const hasSymptoms = worklist.some(
        (w) => w.job_type === picked.job_type
            && w.issue_type === value
            && w.symptom && w.symptom.trim() !== ''
      );
      if (hasSymptoms) {
        setPicked({ job_type: picked.job_type, issue_type: value });
      } else {
        setForm({ job_type: picked.job_type, issue_type: value, symptom: '' });
      }
    } else {
      setForm({ job_type: picked.job_type, issue_type: picked.issue_type, symptom: value });
    }
  };

  // "Other" → prompt for a custom value, then either drill or jump to form
  const pickOther = () => {
    const label = currentLevel === 'job_type' ? 'ประเภทงาน'
      : currentLevel === 'issue_type' ? 'อุปกรณ์/หัวข้อ'
      : 'อาการ';
    const v = prompt(`ระบุ${label}เอง:`);
    if (!v || !v.trim()) return;
    const value = v.trim();
    if (currentLevel === 'symptom') {
      setForm({ job_type: picked.job_type, issue_type: picked.issue_type, symptom: value });
    } else if (currentLevel === 'issue_type') {
      // custom issue_type → no symptoms defined → straight to form
      setForm({ job_type: picked.job_type, issue_type: value, symptom: '' });
    } else {
      // custom job_type → empty issue_type → straight to form
      setForm({ job_type: value, issue_type: '', symptom: '' });
    }
  };

  if (!user || !isItAdmin) return null;

  const crumb = [
    'Backfill',
    picked.job_type,
    picked.issue_type,
  ].filter(Boolean).join(' › ');

  return (
    <div className="bf-shell">
      <header className="bf-head">
        <button
          className="bf-back"
          onClick={() => (picked.job_type ? goBack() : navigate('/hub'))}
        >
          ← {picked.job_type ? 'กลับ' : 'หน้าแรก'}
        </button>
        <h1>{crumb}</h1>
        <span className="bf-sub">
          {currentLevel === 'job_type' && 'เลือกประเภทงาน'}
          {currentLevel === 'issue_type' && 'เลือกอุปกรณ์/หัวข้อ'}
          {currentLevel === 'symptom' && 'เลือกอาการ'}
        </span>
      </header>

      <section className="bf-card">
        <div className="bf-card-h">
          <input
            className="bf-search"
            placeholder="ค้นหา..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="bf-loading">กำลังโหลด…</div>
        ) : (
          <div className="bf-drill">
            {items.map((value) => (
              <button
                key={value}
                type="button"
                className="bf-drill-item"
                onClick={() => pick(value)}
              >
                <span className="bf-drill-label">{value}</span>
                <span className="bf-drill-chev">›</span>
              </button>
            ))}
            <button
              type="button"
              className="bf-drill-item bf-drill-other"
              onClick={pickOther}
            >
              <span className="bf-drill-label">＋ อื่น ๆ / ระบุเอง</span>
              <span className="bf-drill-chev">›</span>
            </button>
          </div>
        )}
      </section>

      {form && (
        <BackfillModal
          issue={form}
          adminId={user.employeeId}
          onClose={() => setForm(null)}
          onSuccess={(ticketNo) => {
            setForm(null);
            // After success, reset drill back to top so the next request
            // starts fresh — most common flow.
            setPicked({ job_type: null, issue_type: null });
            showToast(`เปิด Ticket สำเร็จ: ${ticketNo}`);
          }}
        />
      )}

      {toast && <div className={`bf-toast bf-toast--${toast.kind}`}>{toast.msg}</div>}
    </div>
  );
}

function BackfillModal({ issue, adminId, onClose, onSuccess }) {
  const [empId, setEmpId] = useState('');
  const [emp, setEmp] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [handlerId, setHandlerId] = useState(adminId);
  const [handler, setHandler] = useState(null);
  const [lookingUpHandler, setLookingUpHandler] = useState(false);
  const [request, setRequest] = useState('');
  const [priority, setPriority] = useState('medium');
  const [status, setStatus] = useState('กำลังดำเนินการ');
  const [location, setLocation] = useState('');
  const [photos, setPhotos] = useState([]);          // [{url, name}]
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const needsProof = COMPLETED_STATUSES.has(status);

  useEffect(() => { lookupHandler(adminId); }, [adminId]); // eslint-disable-line react-hooks/exhaustive-deps

  const lookup = async () => {
    const id = empId.trim();
    if (!id) { setEmp(null); return; }
    setLookingUp(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('it_lookup_employee', {
        p_admin_id: adminId,
        p_target_id: id,
      });
      if (err) throw err;
      if (!data || data.length === 0) {
        setEmp(null);
        setError(`ไม่พบรหัสพนักงาน "${id}"`);
      } else {
        setEmp(data[0]);
      }
    } catch (e) {
      setError(e.message || 'ค้นหาไม่สำเร็จ');
    } finally {
      setLookingUp(false);
    }
  };

  const lookupHandler = async (idArg) => {
    const id = (idArg ?? handlerId).trim();
    if (!id) { setHandler(null); return; }
    setLookingUpHandler(true);
    try {
      const { data, error: err } = await supabase.rpc('it_lookup_employee', {
        p_admin_id: adminId,
        p_target_id: id,
      });
      if (err) throw err;
      setHandler((data && data[0]) || null);
    } catch {
      setHandler(null);
    } finally {
      setLookingUpHandler(false);
    }
  };

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const out = [];
      for (const file of files) {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `backfill/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase
          .storage
          .from('ticket-attachments')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('ticket-attachments').getPublicUrl(path);
        out.push({ url: pub.publicUrl, name: file.name });
      }
      setPhotos((prev) => [...prev, ...out]);
    } catch (e) {
      setError(e.message || 'อัพโหลดรูปไม่สำเร็จ');
    } finally {
      setUploading(false);
      e.target.value = '';  // reset so same file can be re-picked
    }
  };

  const removePhoto = (idx) => setPhotos((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!emp) { setError('ค้นหารหัสพนักงานผู้ขอก่อน'); return; }
    if (!handlerId.trim()) { setError('ระบุรหัส IT ผู้ทำ'); return; }
    if (needsProof && photos.length === 0) {
      setError('สถานะ "ดำเนินการเรียบร้อย" หรือ "ปิดงานแล้ว" ต้องแนบรูปหลักฐาน');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('it_backfill_ticket', {
        p_admin_id: adminId,
        p_target_id: emp.employee_id,
        p_handler_id: handlerId.trim(),
        p_job_type: issue.job_type,
        p_issue_type: issue.issue_type,
        p_symptom: issue.symptom || '',
        p_request: request.trim(),
        p_location: location.trim() || null,
        p_priority: priority,
        p_status: status,
        p_photo_urls: photos.length ? photos.map((p) => p.url) : null,
      });
      if (err) throw err;
      onSuccess(data);
    } catch (e) {
      setError(e.message || 'เปิด Ticket ไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bf-backdrop" onClick={onClose}>
      <div className="bf-modal" onClick={(e) => e.stopPropagation()}>
        <button className="bf-modal-x" onClick={onClose} aria-label="ปิด">✕</button>
        <h2>เปิด Ticket ย้อนหลัง</h2>

        <div className="bf-issue-tag">
          <strong>{issue.symptom || issue.issue_type || '(ไม่ระบุ)'}</strong>
          <span>
            {[issue.job_type, issue.issue_type].filter(Boolean).join(' · ')}
          </span>
        </div>

        <label className="bf-field">
          <span>รหัสพนักงาน <b>ผู้ขอ</b> (คนที่มีปัญหา)</span>
          <input
            type="text"
            autoFocus
            value={empId}
            onChange={(e) => setEmpId(e.target.value)}
            onBlur={lookup}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } }}
            placeholder="เช่น 11295"
          />
          {lookingUp && <span className="bf-hint">กำลังค้นหา…</span>}
        </label>

        {emp && (
          <div className="bf-emp-card">
            <div className="bf-emp-name">
              {emp.full_name || '-'}
              {emp.nickname && <span className="bf-emp-nick"> ({emp.nickname})</span>}
            </div>
            <div className="bf-emp-meta">
              {[emp.department, emp.section, emp.company].filter(Boolean).join(' · ') || '-'}
            </div>
            {(emp.phone || emp.email) && (
              <div className="bf-emp-contact">
                {emp.phone && <span>📞 {emp.phone}</span>}
                {emp.email && <span>✉ {emp.email}</span>}
              </div>
            )}
          </div>
        )}

        <label className="bf-field">
          <span>รหัส <b>IT ผู้ทำ</b> (คนที่ดำเนินการ — default คือคุณ)</span>
          <input
            type="text"
            value={handlerId}
            onChange={(e) => setHandlerId(e.target.value)}
            onBlur={() => lookupHandler()}
            placeholder="เช่น 11295"
          />
          {lookingUpHandler && <span className="bf-hint">กำลังค้นหา…</span>}
        </label>

        {handler && (
          <div className="bf-emp-card" style={{ background: 'rgba(var(--accent-rgb), 0.06)' }}>
            <div className="bf-emp-name">
              IT ผู้ทำ: {handler.full_name || '-'}
              {handler.nickname && <span className="bf-emp-nick"> ({handler.nickname})</span>}
            </div>
            <div className="bf-emp-meta">
              {[handler.department, handler.section].filter(Boolean).join(' · ') || '-'}
            </div>
          </div>
        )}

        <label className="bf-field">
          <span>สถานะปัจจุบัน</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="เปิด Ticket">🟡 เปิด Ticket (รอดำเนินการ)</option>
            <option value="กำลังดำเนินการ">🔵 กำลังดำเนินการ</option>
            <option value="ดำเนินการเรียบร้อย">🟢 ดำเนินการเรียบร้อย (รอยืนยันปิดงาน)</option>
            <option value="ปิดงานแล้ว">⚫ ปิดงานแล้ว</option>
            <option value="ยกเลิก">🔴 ยกเลิก</option>
          </select>
        </label>

        <label className="bf-field">
          <span>สถานที่ (ถ้าระบุ)</span>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="เช่น Comets HQ ชั้น 3"
          />
        </label>

        <label className="bf-field">
          <span>ระดับเร่งด่วน</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="urgent">🔴 ด่วนมาก</option>
            <option value="high">🟠 สำคัญ</option>
            <option value="medium">🟡 ปกติ</option>
            <option value="low">⚪ ไม่เร่ง</option>
          </select>
        </label>

        <label className="bf-field">
          <span>รายละเอียดเพิ่มเติม (ถ้ามี)</span>
          <textarea
            rows={3}
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="user แจ้งทางโทรศัพท์ว่า... / ขอให้แก้ที่..."
          />
        </label>

        <div className="bf-field">
          <span>
            รูปหลักฐาน
            {needsProof && <b style={{ color: '#dc2626' }}> *จำเป็น</b>}
          </span>
          <div className="bf-photos">
            {photos.map((p, i) => (
              <div key={i} className="bf-photo">
                <img src={p.url} alt={p.name} />
                <button
                  type="button"
                  className="bf-photo-x"
                  onClick={() => removePhoto(i)}
                  aria-label="ลบ"
                >✕</button>
              </div>
            ))}
            <label className="bf-photo-add">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFiles}
                disabled={uploading}
                style={{ display: 'none' }}
              />
              <span>{uploading ? 'กำลังอัพโหลด…' : '＋ เพิ่มรูป'}</span>
            </label>
          </div>
        </div>

        {error && <div className="bf-error">{error}</div>}

        <div className="bf-actions">
          <button type="button" className="bf-btn bf-btn-cancel" onClick={onClose} disabled={submitting}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="bf-btn bf-btn-go"
            onClick={submit}
            disabled={submitting || !emp || uploading || (needsProof && photos.length === 0)}
          >
            {submitting ? 'กำลังเปิด…' : 'เปิด Ticket'}
          </button>
        </div>
      </div>
    </div>
  );
}
