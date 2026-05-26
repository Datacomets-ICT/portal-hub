import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

// Repair (ช่าง) — Phase 1 hub
//
// Layout:
//   ┌──────────────────────────────────────┐
//   │ ← back   ระบบแจ้งซ่อม                │
//   │                                      │
//   │ [รอดำเนินการ 5] [กำลังทำ 3] [สำเร็จ 30]│
//   │                                      │
//   │ ค้นหา... + ปุ่ม [+ แจ้งซ่อมใหม่]      │
//   │                                      │
//   │ ┌──────┬────────┬────────┬────────┐ │
//   │ │ JOB#│ผู้แจ้ง│ ปัญหา │ สถานะ  │ │
//   │ └──────┴────────┴────────┴────────┘ │
//   └──────────────────────────────────────┘
//
// Phase 2 will add: create form (drill same as Backfill), detail page,
// status workflow buttons, photo upload.

const STATUS_ORDER = [
  'ทั้งหมด',
  'รอดำเนินการ',
  'กำลังดำเนินการ',
  'รออนุมัติ',
  'รอช่างนอก',
  'ดำเนินการสำเร็จ',
  'ปิดงานแล้ว',
  'ยกเลิก',
];

const STATUS_PILL = {
  'รอดำเนินการ':     { bg: '#fef3c7', fg: '#92400e' },
  'กำลังดำเนินการ':  { bg: '#dbeafe', fg: '#1e40af' },
  'รออนุมัติ':        { bg: '#fce7f3', fg: '#9d174d' },
  'รอช่างนอก':        { bg: '#ede9fe', fg: '#5b21b6' },
  'ดำเนินการสำเร็จ': { bg: '#d1fae5', fg: '#065f46' },
  'ปิดงานแล้ว':       { bg: '#e5e7eb', fg: '#374151' },
  'ยกเลิก':           { bg: '#fee2e2', fg: '#991b1b' },
};

export default function RepairHubPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});  // { status: n }
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ทั้งหมด');
  const [search, setSearch] = useState('');
  const [err, setErr] = useState(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [{ data: jobs, error: jErr }, { data: cts, error: cErr }] = await Promise.all([
        supabase.rpc('rpr_list_jobs', {
          p_status: statusFilter === 'ทั้งหมด' ? null : statusFilter,
          p_limit: 200,
          p_offset: 0,
        }),
        supabase.rpc('rpr_job_counts'),
      ]);
      if (jErr) throw jErr;
      if (cErr) throw cErr;
      setRows(jobs || []);
      const m = {};
      let total = 0;
      (cts || []).forEach((r) => { m[r.status] = Number(r.n); total += Number(r.n); });
      m['ทั้งหมด'] = total;
      setCounts(m);
    } catch (e) {
      setErr(e.message || 'โหลดไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.job_id, r.reporter_name, r.reporter_dept, r.repair_type, r.item, r.floor, r.zone, r.assigned_to]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [rows, search]);

  const fmtDate = (s) => {
    if (!s) return '-';
    try {
      const d = new Date(s);
      return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    } catch { return s; }
  };

  if (!user) return null;

  return (
    <div className="rpr-shell">
      <header className="rpr-head">
        <button className="rpr-back" onClick={() => navigate('/hub')}>← กลับ</button>
        <h1>ระบบแจ้งซ่อม</h1>
        <span className="rpr-sub">ช่างประจำอาคาร</span>
      </header>

      {/* Status filter chips */}
      <div className="rpr-chips">
        {STATUS_ORDER.map((s) => {
          const n = counts[s] || 0;
          const active = statusFilter === s;
          return (
            <button
              key={s}
              type="button"
              className={`rpr-chip ${active ? 'rpr-chip--on' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s}
              <span className="rpr-chip-n">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="rpr-controls">
        <input
          className="rpr-search"
          placeholder="ค้นหา JobID / ชื่อ / อุปกรณ์ / ชั้น..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          className="rpr-new"
          onClick={() => navigate('/repair/new')}
        >
          ＋ แจ้งซ่อมใหม่
        </button>
      </div>

      {err && <div className="rpr-err">{err}</div>}

      {loading ? (
        <div className="rpr-loading">กำลังโหลด…</div>
      ) : visible.length === 0 ? (
        <div className="rpr-empty">ไม่พบงานในเงื่อนไขนี้</div>
      ) : (
        <div className="rpr-table-wrap">
          <table className="rpr-table">
            <thead>
              <tr>
                <th>JobID</th>
                <th>ผู้แจ้ง</th>
                <th>แผนก</th>
                <th>ปัญหา</th>
                <th>ตำแหน่ง</th>
                <th>แจ้งเมื่อ</th>
                <th>สถานะ</th>
                <th>ช่าง</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const pill = STATUS_PILL[r.status] || { bg: '#f3f4f6', fg: '#374151' };
                return (
                  <tr
                    key={r.job_id}
                    onClick={() => navigate(`/repair/${r.job_id}`)}
                  >
                    <td className="rpr-td-id">{r.job_id}</td>
                    <td>{r.reporter_name || '-'}</td>
                    <td className="rpr-td-dim">{r.reporter_dept || '-'}</td>
                    <td>
                      <div className="rpr-issue">{r.item || '-'}</div>
                      {r.repair_type && (
                        <div className="rpr-issue-sub">{r.repair_type}</div>
                      )}
                    </td>
                    <td className="rpr-td-dim">
                      {[r.floor, r.zone].filter(Boolean).join(' · ') || '-'}
                    </td>
                    <td className="rpr-td-dim">{fmtDate(r.reported_at)}</td>
                    <td>
                      <span className="rpr-pill" style={{ background: pill.bg, color: pill.fg }}>
                        {r.status}
                      </span>
                    </td>
                    <td>{r.assigned_to || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="rpr-table-foot">
            แสดง {visible.length} จาก {rows.length} รายการ
          </div>
        </div>
      )}
    </div>
  );
}
