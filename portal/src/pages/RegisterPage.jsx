import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

const COMPANIES = ['Comets', 'ICT', 'JA'];

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    empId: '',
    password: '',
    company: '',
    firstName: '',
    lastName: '',
    nickname: '',
    position: '',
    email: '',
    phone: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!form.company) {
      setError('กรุณาเลือกสังกัด');
      return;
    }
    setBusy(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc('register_employee', {
        p_emp_id: form.empId.trim(),
        p_password: form.password.trim(),
        p_company: form.company,
        p_first_name: form.firstName.trim(),
        p_last_name: form.lastName.trim(),
        p_nickname: form.nickname.trim(),
        p_position: form.position.trim(),
        p_email: form.email.trim(),
        p_phone: form.phone.trim(),
      });
      if (rpcErr) throw rpcErr;
      if (!data || !data.success) throw new Error(data?.message || 'ลงทะเบียนไม่สำเร็จ');
      setSuccess(data.message || 'ลงทะเบียนสำเร็จ — กลับไปหน้าเข้าสู่ระบบใน 2 วินาที');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาด');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap register-wrap">
      <aside className="login-hero">
        <div className="brand-mark">P</div>
        <h1>
          ลงทะเบียน
          <br />
          ผู้ใช้ใหม่
        </h1>
        <p className="lede">
          สร้างบัญชีเพื่อเข้าใช้ระบบ IT Ticket, Driver Booking และ Meeting Rooms
          ด้วยรหัสพนักงานเดียว
        </p>
        <p className="lede" style={{ fontSize: 14 }}>
          <Link to="/login" style={{ fontWeight: 600 }}>
            ← กลับไปหน้าเข้าสู่ระบบ
          </Link>
        </p>
      </aside>

      <div className="login-card-wrap">
        <form className="login-card register-card" onSubmit={submit}>
          <h2 className="login-title">สร้างบัญชีใหม่</h2>
          <p className="login-sub">กรอกข้อมูลเพื่อสมัครใช้งานระบบ</p>

          {error && (
            <div className="error">
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}
          {success && <div className="success">{success}</div>}

          <div className="form-row">
            <div className="field">
              <label>รหัสพนักงาน *</label>
              <input type="text" value={form.empId} onChange={update('empId')} required disabled={busy} placeholder="เช่น 31043" />
            </div>
            <div className="field">
              <label>รหัสผ่าน *</label>
              <input type="password" value={form.password} onChange={update('password')} required disabled={busy} placeholder="ตั้งรหัสผ่าน" />
            </div>
          </div>

          <div className="field">
            <label>สังกัด *</label>
            <div className="radio-row">
              {COMPANIES.map((c) => (
                <label
                  key={c}
                  className={`radio-chip ${form.company === c ? 'on' : ''}`}
                >
                  <input
                    type="radio"
                    name="company"
                    value={c}
                    checked={form.company === c}
                    onChange={update('company')}
                    disabled={busy}
                  />
                  <span>{c}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label>ชื่อ (ไทย)</label>
              <input type="text" value={form.firstName} onChange={update('firstName')} disabled={busy} placeholder="ชื่อจริง" />
            </div>
            <div className="field">
              <label>นามสกุล (ไทย)</label>
              <input type="text" value={form.lastName} onChange={update('lastName')} disabled={busy} placeholder="นามสกุล" />
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label>ชื่อเล่น</label>
              <input type="text" value={form.nickname} onChange={update('nickname')} disabled={busy} placeholder="ชื่อเล่น" />
            </div>
            <div className="field">
              <label>ตำแหน่ง</label>
              <input type="text" value={form.position} onChange={update('position')} disabled={busy} placeholder="ตำแหน่งงาน" />
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label>อีเมล</label>
              <input type="email" value={form.email} onChange={update('email')} disabled={busy} placeholder="email@company.com" />
            </div>
            <div className="field">
              <label>เบอร์โทร</label>
              <input type="tel" value={form.phone} onChange={update('phone')} disabled={busy} placeholder="0XX-XXX-XXXX" />
            </div>
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px 16px', justifyContent: 'center', marginTop: 6 }}
            disabled={busy}
          >
            {busy ? 'กำลังลงทะเบียน…' : 'ลงทะเบียน'}
          </button>

          <div className="login-aux" style={{ textAlign: 'center' }}>
            <div className="login-aux-sep">
              มีบัญชีอยู่แล้ว? <Link to="/login">เข้าสู่ระบบ</Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
