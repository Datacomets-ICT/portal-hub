import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

// Admin System — system-role employees only.
//
// Three sections:
//   1. Stats cards (total users, active, pending)
//   2. Employee table — per-app role dropdowns (none/user/admin)
//   3. Announcement composer — posts a message that everyone sees as a
//      bottom-right marquee on the hub
//
// Auth: redirects non-admins back to /hub. The RPCs themselves also
// re-check via is_system_admin so a forged client can't bypass.

export default function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const isAdmin = useMemo(() => {
    if (!user) return false;
    return user.role === 'system' || user.isAdmin === true;
  }, [user]);

  useEffect(() => {
    if (user && !isAdmin) navigate('/hub', { replace: true });
  }, [user, isAdmin, navigate]);

  const [stats, setStats] = useState({ total: 0, active: 0, pending: 0 });
  const [employees, setEmployees] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, kind = 'ok') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3000);
  };

  const reloadAll = useCallback(async () => {
    if (!user?.employeeId) return;
    setLoading(true);
    try {
      const [s, e] = await Promise.all([
        supabase.rpc('admin_user_stats', { p_admin_id: user.employeeId }),
        supabase.rpc('admin_list_employees', { p_admin_id: user.employeeId }),
      ]);
      if (s.error) throw s.error;
      if (e.error) throw e.error;
      setStats(s.data || { total: 0, active: 0, pending: 0 });
      setEmployees(e.data || []);
    } catch (err) {
      showToast(err.message || 'โหลดข้อมูลไม่สำเร็จ', 'err');
    } finally {
      setLoading(false);
    }
  }, [user?.employeeId]);

  useEffect(() => {
    if (isAdmin) reloadAll();
  }, [isAdmin, reloadAll]);

  const updateRole = async (empId, app, role) => {
    setSavingId(`${empId}:${app}`);
    try {
      const { error } = await supabase.rpc('admin_set_user_role', {
        p_admin_id: user.employeeId,
        p_target_id: empId,
        p_app: app,
        p_role: role,
      });
      if (error) throw error;
      // Optimistic update of local row
      setEmployees((rows) =>
        rows.map((r) => (r.employee_id === empId ? { ...r, [`${app}_role`]: role } : r))
      );
      showToast(`อัปเดตสิทธิ์ ${app} ของ ${empId} แล้ว`);
    } catch (err) {
      showToast(err.message || 'บันทึกไม่สำเร็จ', 'err');
    } finally {
      setSavingId(null);
    }
  };

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => {
      const hay = [
        e.employee_id,
        e.first_name,
        e.last_name,
        e.nickname,
        e.email,
        e.department,
        e.section,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [employees, filter]);

  if (!user) return null;
  if (!isAdmin) return null;

  return (
    <div className="admin-shell">
      <header className="admin-head">
        <button className="admin-back" onClick={() => navigate('/hub')} title="กลับหน้าหลัก">
          ← กลับ
        </button>
        <h1>Admin System</h1>
        <span className="admin-sub">จัดการสิทธิ์ผู้ใช้ + ประกาศระบบ</span>
      </header>

      {/* Stats */}
      <section className="admin-stats">
        <div className="admin-stat">
          <div className="admin-stat-num">{stats.total}</div>
          <div className="admin-stat-lab">พนักงานทั้งหมด</div>
        </div>
        <div className="admin-stat admin-stat--ok">
          <div className="admin-stat-num">{stats.active}</div>
          <div className="admin-stat-lab">ใช้งานอยู่</div>
        </div>
        {stats.pending > 0 && (
          <div className="admin-stat admin-stat--warn">
            <div className="admin-stat-num">{stats.pending}</div>
            <div className="admin-stat-lab">รออนุมัติ</div>
          </div>
        )}
      </section>

      {/* Announcement composer */}
      <AnnouncementCard userId={user.employeeId} onPosted={() => showToast('ประกาศเรียบร้อย')} />

      {/* Employees table */}
      <section className="admin-card">
        <div className="admin-card-h">
          <h2>สิทธิ์ผู้ใช้แต่ละแอป</h2>
          <input
            className="admin-search"
            placeholder="ค้นหา รหัส / ชื่อ / แผนก..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="admin-loading">กำลังโหลด…</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>รหัส</th>
                  <th>ชื่อ</th>
                  <th>แผนก</th>
                  <th>IT-Ticket</th>
                  <th>Driver</th>
                  <th>Meeting</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={7} className="admin-empty">ไม่พบข้อมูล</td>
                  </tr>
                )}
                {visible.map((e) => {
                  const fullName =
                    [e.first_name, e.last_name].filter(Boolean).join(' ') || e.nickname || '-';
                  const dept = [e.department, e.section].filter(Boolean).join(' / ');
                  const status = !e.is_approved
                    ? { label: 'รออนุมัติ', cls: 'pending' }
                    : e.resigned_date
                    ? { label: 'ลาออก', cls: 'resigned' }
                    : { label: 'Active', cls: 'active' };
                  return (
                    <tr key={e.employee_id}>
                      <td className="mono">{e.employee_id}</td>
                      <td>{fullName}</td>
                      <td className="dept">{dept || '-'}</td>
                      <td>
                        <RoleSelect
                          value={e.it_role}
                          busy={savingId === `${e.employee_id}:it`}
                          onChange={(v) => updateRole(e.employee_id, 'it', v)}
                        />
                      </td>
                      <td>
                        <RoleSelect
                          value={e.driver_role}
                          busy={savingId === `${e.employee_id}:driver`}
                          onChange={(v) => updateRole(e.employee_id, 'driver', v)}
                        />
                      </td>
                      <td>
                        <RoleSelect
                          value={e.meeting_role}
                          busy={savingId === `${e.employee_id}:meeting`}
                          onChange={(v) => updateRole(e.employee_id, 'meeting', v)}
                        />
                      </td>
                      <td>
                        <span className={`admin-badge admin-badge--${status.cls}`}>
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {toast && (
        <div className={`admin-toast admin-toast--${toast.kind}`}>{toast.msg}</div>
      )}
    </div>
  );
}

// Three-state dropdown — change immediately POSTs to admin_set_user_role.
// Disables itself while a save is in flight to avoid double-fire.
function RoleSelect({ value, busy, onChange }) {
  return (
    <select
      className="admin-role"
      value={value || 'user'}
      disabled={busy}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="none">— ไม่ให้เข้า —</option>
      <option value="user">User</option>
      <option value="admin">Admin</option>
    </select>
  );
}

// Composer + recent-announcements list. Posts via post_announcement RPC,
// auto-refreshes the recent list. Marquee on every page (rendered in
// App.jsx) will pick up the new one within ~30 s.
function AnnouncementCard({ userId, onPosted }) {
  const [message, setMessage] = useState('');
  const [hours, setHours] = useState(24);
  const [posting, setPosting] = useState(false);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_list_announcements', {
        p_admin_id: userId,
      });
      if (!error) setRecent(data || []);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const post = async () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setPosting(true);
    try {
      const { error } = await supabase.rpc('post_announcement', {
        p_admin_id: userId,
        p_message: trimmed,
        p_hours: hours || null,
      });
      if (error) throw error;
      setMessage('');
      onPosted?.();
      reload();
    } catch (err) {
      alert(err.message || 'ส่งประกาศไม่สำเร็จ');
    } finally {
      setPosting(false);
    }
  };

  const dismiss = async (id) => {
    if (!confirm('ยกเลิกประกาศนี้?')) return;
    try {
      const { error } = await supabase.rpc('dismiss_announcement', {
        p_admin_id: userId,
        p_id: id,
      });
      if (error) throw error;
      reload();
    } catch (err) {
      alert(err.message || 'ยกเลิกไม่สำเร็จ');
    }
  };

  return (
    <section className="admin-card admin-announce">
      <div className="admin-card-h">
        <h2>📢 ประกาศระบบ</h2>
      </div>
      <div className="admin-announce-form">
        <textarea
          className="admin-announce-input"
          placeholder="พิมพ์ข้อความประกาศ — ทุกคนจะเห็นที่มุมล่างขวาของหน้าจอ"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
        />
        <div className="admin-announce-controls">
          <label className="admin-announce-hours">
            หมดอายุใน
            <select value={hours} onChange={(e) => setHours(Number(e.target.value) || null)}>
              <option value={1}>1 ชั่วโมง</option>
              <option value={6}>6 ชั่วโมง</option>
              <option value={24}>24 ชั่วโมง</option>
              <option value={72}>3 วัน</option>
              <option value={168}>7 วัน</option>
              <option value={0}>ไม่หมดอายุ</option>
            </select>
          </label>
          <button
            type="button"
            className="admin-announce-btn"
            onClick={post}
            disabled={posting || !message.trim()}
          >
            {posting ? 'กำลังส่ง…' : 'ส่งประกาศ'}
          </button>
        </div>
      </div>

      {recent.length > 0 && (
        <div className="admin-announce-list">
          <div className="admin-announce-list-h">ประกาศล่าสุด ({recent.length})</div>
          {recent.map((a) => (
            <div key={a.id} className={`admin-announce-row ${!a.active ? 'is-off' : ''}`}>
              <div className="admin-announce-row-msg">{a.message}</div>
              <div className="admin-announce-row-meta">
                {new Date(a.created_at).toLocaleString('th-TH')}
                {a.expires_at && ` · หมดอายุ ${new Date(a.expires_at).toLocaleString('th-TH')}`}
                {!a.active && ' · ยกเลิกแล้ว'}
              </div>
              {a.active && (
                <button className="admin-announce-row-x" onClick={() => dismiss(a.id)} title="ยกเลิก">
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {loading && recent.length === 0 && <div className="admin-loading">กำลังโหลด…</div>}
    </section>
  );
}
