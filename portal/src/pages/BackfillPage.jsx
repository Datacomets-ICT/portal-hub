import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

// IT Admin "ticket backfill" page — for walk-up / phone-call requests
// where the user didn't open a ticket themselves.
//
// Layout:
//   ┌──────────────────────────────────────┐
//   │ ← back   Backfill Ticket             │
//   │                                      │
//   │ ปัญหายอดฮิต (90 วันล่าสุด)           │
//   │ [Email · อีเมลเต็ม         | 23 ครั้ง]│  ← click to start backfill
//   │ [SAP · ล็อกอินไม่ได้       | 18 ครั้ง]│
//   │ [คอมพิวเตอร์ · หน้าจอฟ้า  | 12 ครั้ง]│
//   │ ...                                  │
//   └──────────────────────────────────────┘
//
// Click a button → modal opens:
//   - empId input (autofocus)
//   - on blur → fetch employee details (name, dept, phone)
//   - free-text "รายละเอียด" + priority
//   - submit → it_backfill_ticket RPC → returns ticket_no → toast

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

  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [picked, setPicked] = useState(null);
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
        const { data, error } = await supabase.rpc('it_top_issues', {
          p_admin_id: user.employeeId,
          p_limit: 30,
          p_days: 90,
        });
        if (error) throw error;
        setIssues(data || []);
      } catch (err) {
        showToast(err.message || 'โหลดไม่สำเร็จ', 'err');
      } finally {
        setLoading(false);
      }
    })();
  }, [isItAdmin, user?.employeeId]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return issues;
    return issues.filter((it) =>
      [it.job_type, it.issue_type, it.symptom]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [issues, filter]);

  if (!user || !isItAdmin) return null;

  return (
    <div className="bf-shell">
      <header className="bf-head">
        <button className="bf-back" onClick={() => navigate('/hub')}>← กลับ</button>
        <h1>Backfill Ticket</h1>
        <span className="bf-sub">เปิด Ticket ย้อนหลังให้พนักงาน</span>
      </header>

      <section className="bf-card">
        <div className="bf-card-h">
          <h2>ปัญหายอดฮิต <span className="bf-card-sub">(90 วันล่าสุด)</span></h2>
          <input
            className="bf-search"
            placeholder="ค้นหา..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="bf-loading">กำลังโหลด…</div>
        ) : visible.length === 0 ? (
          <div className="bf-empty">ไม่พบข้อมูล</div>
        ) : (
          <div className="bf-issues">
            {visible.map((it, i) => (
              <button
                key={`${it.job_type}|${it.issue_type}|${it.symptom}|${i}`}
                type="button"
                className="bf-issue"
                onClick={() => setPicked(it)}
              >
                <div className="bf-issue-main">
                  <div className="bf-issue-symptom">{it.symptom || '(ไม่ระบุ symptom)'}</div>
                  <div className="bf-issue-meta">
                    {it.issue_type} · {it.job_type}
                  </div>
                </div>
                <div className="bf-issue-count">
                  {it.ticket_count}
                  <span>ครั้ง</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {picked && (
        <BackfillModal
          issue={picked}
          adminId={user.employeeId}
          onClose={() => setPicked(null)}
          onSuccess={(ticketNo) => {
            setPicked(null);
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
  const [status, setStatus] = useState('เปิด Ticket');
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Pre-fill the handler card with the current admin on first render so
  // the user can see who's set as the doer without having to click out.
  useEffect(() => { lookupHandler(adminId); }, [adminId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lookup requester (the user with the problem) on blur
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

  // Lookup handler (the IT person doing the work).
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

  const submit = async () => {
    if (!emp) { setError('ค้นหารหัสพนักงานผู้ขอก่อน'); return; }
    if (!handlerId.trim()) { setError('ระบุรหัส IT ผู้ทำ'); return; }
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
          <strong>{issue.symptom || '(ไม่ระบุ)'}</strong>
          <span>{issue.issue_type} · {issue.job_type}</span>
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
          <span>สถานะปัจจุบัน <small style={{ color: 'var(--ink-3)' }}>(เพราะเปิดย้อนหลัง อาจเสร็จไปแล้ว)</small></span>
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

        {error && <div className="bf-error">{error}</div>}

        <div className="bf-actions">
          <button type="button" className="bf-btn bf-btn-cancel" onClick={onClose} disabled={submitting}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="bf-btn bf-btn-go"
            onClick={submit}
            disabled={submitting || !emp}
          >
            {submitting ? 'กำลังเปิด…' : 'เปิด Ticket'}
          </button>
        </div>
      </div>
    </div>
  );
}
