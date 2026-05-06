import { useState, useEffect } from 'react';
import { fetchEmployeeByCode } from './api/employees';

export default function LoginScreen({ onLogin }) {
  const [code, setCode] = useState('');
  const [emp, setEmp] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | found | notfound
  const [error, setError] = useState(null);

  useEffect(() => {
    if (code.length < 5) {
      setEmp(null);
      setStatus('idle');
      setError(null);
      return;
    }
    let cancelled = false;
    setStatus('loading');
    setError(null);
    fetchEmployeeByCode(code)
      .then((e) => {
        if (cancelled) return;
        if (e) {
          setEmp(e);
          setStatus('found');
        } else {
          setEmp(null);
          setStatus('notfound');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || String(err));
        setEmp(null);
        setStatus('notfound');
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const handleLogin = () => {
    if (!emp) return;
    onLogin(emp);
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && status === 'found') handleLogin();
  };

  return (
    <div className="login-gate">
      <div className="login-card">
        <div className="login-head">
          <div className="brand-mark" />
          <h1>Meeting Rooms</h1>
          <p>ระบบจองห้องประชุม</p>
        </div>

        <label className="login-field">
          <span>รหัสพนักงาน</span>
          <input
            autoFocus
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={onKey}
            placeholder="ใส่รหัสพนักงาน"
          />
        </label>

        <div className="login-status-area">
          {status === 'loading' && <div className="login-status">กำลังค้นหา…</div>}
          {status === 'notfound' && code.length >= 5 && (
            <div className="login-status err">
              ไม่พบรหัสพนักงาน <code>{code}</code>
              {error && <div className="login-status-detail">{error}</div>}
            </div>
          )}
          {status === 'found' && emp && (
            <div className="login-found">
              <div className="login-found-avatar">{(emp.nickname || emp.name)[0]}</div>
              <div className="login-found-text">
                <div className="login-found-name">
                  {emp.name}
                  {emp.nickname && <span className="nick"> ({emp.nickname})</span>}
                </div>
                <div className="login-found-meta">
                  รหัส {emp.code}
                  {emp.dept && <> · {emp.dept}</>}
                </div>
                {emp.position && (
                  <div className="login-found-pos">{emp.position}</div>
                )}
              </div>
            </div>
          )}
        </div>

        <button
          className="login-submit"
          disabled={status !== 'found'}
          onClick={handleLogin}
        >
          เข้าสู่ระบบ
        </button>

        <div className="login-hint">ไม่ต้องใส่รหัสผ่าน — ระบบภายในองค์กร</div>
      </div>
    </div>
  );
}
