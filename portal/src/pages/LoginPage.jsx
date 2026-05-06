import { useState, useEffect, useRef } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

// =====================================================================
// Oneko — pixel cat that follows the mouse cursor.
// Port of adryd325/oneko.js (MIT, classic Neko sprite is PD).
// Sprite served from jsdelivr's GitHub mirror so we don't vendor a binary.
// =====================================================================
const ONEKO_SPRITE = 'https://cdn.jsdelivr.net/gh/adryd325/oneko.js@main/oneko.gif';
const SPRITE_SETS = {
  idle:        [[-3, -3]],
  alert:       [[-7, -3]],
  scratchSelf: [[-5,  0], [-6,  0], [-7,  0]],
  scratchWallN:[[ 0,  0], [ 0, -1]],
  scratchWallS:[[-7, -1], [-6, -2]],
  scratchWallE:[[-2, -2], [-2, -3]],
  scratchWallW:[[-4,  0], [-4, -1]],
  tired:       [[-3, -2]],
  sleeping:    [[-2,  0], [-2, -1]],
  N:           [[-1, -2], [-1, -3]],
  NE:          [[ 0, -2], [ 0, -3]],
  E:           [[-3,  0], [-3, -1]],
  SE:          [[-5, -1], [-5, -2]],
  S:           [[-6, -3], [-7, -2]],
  SW:          [[-5, -3], [-6, -1]],
  W:           [[-4, -2], [-4, -3]],
  NW:          [[-1,  0], [-1, -1]],
};

function Oneko() {
  const ref = useRef(null);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const nekoEl = ref.current;
    if (!nekoEl) return;

    let nekoPosX = 32, nekoPosY = window.innerHeight - 32;
    let mousePosX = window.innerWidth / 2, mousePosY = window.innerHeight / 2;
    let frameCount = 0, idleTime = 0, idleAnimation = null, idleAnimationFrame = 0;
    const NEKO_SPEED = 10;

    nekoEl.style.left = `${nekoPosX - 16}px`;
    nekoEl.style.top  = `${nekoPosY - 16}px`;

    const onMove = (e) => { mousePosX = e.clientX; mousePosY = e.clientY; };
    document.addEventListener('mousemove', onMove);

    function setSprite(name, frame) {
      const set = SPRITE_SETS[name] || SPRITE_SETS.idle;
      const s = set[frame % set.length];
      nekoEl.style.backgroundPosition = `${s[0] * 32}px ${s[1] * 32}px`;
    }
    function resetIdle() { idleAnimation = null; idleAnimationFrame = 0; }
    function idle() {
      idleTime += 1;
      if (idleTime > 10 && Math.floor(Math.random() * 200) === 0 && !idleAnimation) {
        const choices = ['sleeping', 'scratchSelf'];
        if (nekoPosX < 32) choices.push('scratchWallW');
        if (nekoPosY < 32) choices.push('scratchWallN');
        if (nekoPosX > window.innerWidth  - 32) choices.push('scratchWallE');
        if (nekoPosY > window.innerHeight - 32) choices.push('scratchWallS');
        idleAnimation = choices[Math.floor(Math.random() * choices.length)];
      }
      switch (idleAnimation) {
        case 'sleeping':
          if (idleAnimationFrame < 8) { setSprite('tired', 0); break; }
          setSprite('sleeping', Math.floor(idleAnimationFrame / 4));
          if (idleAnimationFrame > 192) resetIdle();
          break;
        case 'scratchWallN':
        case 'scratchWallS':
        case 'scratchWallE':
        case 'scratchWallW':
        case 'scratchSelf':
          setSprite(idleAnimation, idleAnimationFrame);
          if (idleAnimationFrame > 9) resetIdle();
          break;
        default:
          setSprite('idle', 0);
          return;
      }
      idleAnimationFrame += 1;
    }
    function tick() {
      frameCount += 1;
      const diffX = nekoPosX - mousePosX;
      const diffY = nekoPosY - mousePosY;
      const distance = Math.sqrt(diffX * diffX + diffY * diffY);
      if (distance < NEKO_SPEED || distance < 48) { idle(); return; }
      idleAnimation = null; idleAnimationFrame = 0;
      if (idleTime > 1) {
        setSprite('alert', 0);
        idleTime = Math.min(idleTime, 7) - 1;
        return;
      }
      let dir = '';
      dir += diffY / distance >  0.5 ? 'N' : '';
      dir += diffY / distance < -0.5 ? 'S' : '';
      dir += diffX / distance >  0.5 ? 'W' : '';
      dir += diffX / distance < -0.5 ? 'E' : '';
      setSprite(dir || 'idle', frameCount);
      nekoPosX -= (diffX / distance) * NEKO_SPEED;
      nekoPosY -= (diffY / distance) * NEKO_SPEED;
      nekoPosX = Math.min(Math.max(16, nekoPosX), window.innerWidth  - 16);
      nekoPosY = Math.min(Math.max(16, nekoPosY), window.innerHeight - 16);
      nekoEl.style.left = `${nekoPosX - 16}px`;
      nekoEl.style.top  = `${nekoPosY - 16}px`;
    }

    let last = 0, raf = 0;
    function loop(ts) {
      if (!nekoEl.isConnected) return;
      if (!last) last = ts;
      if (ts - last > 100) { last = ts; tick(); }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousemove', onMove);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        width: 32, height: 32,
        position: 'fixed', pointerEvents: 'none',
        imageRendering: 'pixelated',
        backgroundImage: `url(${ONEKO_SPRITE})`,
        zIndex: 2147483647,
      }}
    />
  );
}


function ForgotModal({ initialEmpId, onClose }) {
  const [empId, setEmpId] = useState(initialEmpId || '');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { kind: 'error'|'success', text }

  const submit = async (e) => {
    e.preventDefault();
    if (!empId.trim()) {
      setMsg({ kind: 'error', text: 'กรุณากรอกรหัสพนักงาน' });
      return;
    }
    if (!email.trim()) {
      setMsg({ kind: 'error', text: 'กรุณากรอกอีเมล' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      // /api/forgot-password sends a Gmail SMTP notification from
      // data@ictcos-cm.com → IT inbox with the user's email as Reply-To.
      const r = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), empId: empId.trim() }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.success) throw new Error(data.message || data.error || 'ส่งคำขอไม่สำเร็จ');
      setMsg({ kind: 'success', text: data.message || 'ส่งคำขอไปทีม IT เรียบร้อย — เจ้าหน้าที่จะติดต่อกลับทางอีเมล' });
    } catch (err) {
      setMsg({ kind: 'error', text: err.message || 'เกิดข้อผิดพลาด' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>🔑 ลืมรหัสผ่าน</h3>
        <p className="modal-desc">กรอกข้อมูลของคุณ — ทีม IT จะติดต่อกลับทางอีเมลเพื่อตั้งรหัสผ่านใหม่ให้</p>
        {msg && <div className={msg.kind === 'error' ? 'error' : 'success'}>{msg.text}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>รหัสพนักงาน *</label>
            <input
              type="text"
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
              autoFocus
              required
              disabled={busy}
            />
          </div>
          <div className="field">
            <label>อีเมลที่ใช้ติดต่อกลับ *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={busy}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
              ปิด
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'กำลังส่ง…' : 'ส่งคำขอไปทีม IT'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [empId, setEmpId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  if (user) return <Navigate to="/hub" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(empId.trim(), password.trim());
      navigate('/hub', { replace: true });
    } catch (err) {
      setError(err.message || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-bg" aria-hidden="true">
        <span className="orb orb-1" />
        <span className="orb orb-2" />
        <span className="orb orb-3" />
        <span className="orb orb-4" />
        <span className="orb orb-5" />
      </div>
      <Oneko />
      <aside className="login-hero">
        <h1>
          ศูนย์รวมระบบภายใน
          <br />
          องค์กร
        </h1>
        <p className="lede">
          เข้าสู่ระบบครั้งเดียว ใช้ได้ทั้ง IT Ticket · Driver Booking · Meeting Rooms
          ไม่ต้องจำหลายบัญชี ไม่ต้องล็อกอินซ้ำ
        </p>
        <ul className="feature-list">
          <li>
            <span className="dot">✓</span> Single sign-on ด้วยรหัสพนักงานเดียว
          </li>
          <li>
            <span className="dot">✓</span> เลือกแอปจากหน้าเดียว
          </li>
          <li>
            <span className="dot">✓</span> รองรับมือถือและเดสก์ท็อป
          </li>
        </ul>
      </aside>

      <div className="login-card-wrap">
        <form className="login-card" onSubmit={submit}>
          <h2 className="login-title">เข้าสู่ระบบ</h2>
          <p className="login-sub">ใช้รหัสพนักงานและรหัสผ่านของคุณ</p>
          {error && (
            <div className="error">
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}
          <div className="field">
            <label>รหัสพนักงาน</label>
            <input
              type="text"
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
              placeholder="เช่น 11295"
              autoFocus
              required
            />
          </div>
          <div className="field">
            <label>รหัสผ่าน</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px 16px', justifyContent: 'center' }}
            disabled={busy}
          >
            {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>

          <div className="login-aux">
            <button
              type="button"
              className="link-btn"
              onClick={() => setForgotOpen(true)}
            >
              ลืมรหัสผ่าน?
            </button>
            <div className="login-aux-sep">
              ยังไม่มีบัญชี? <Link to="/register">ลงทะเบียนที่นี่</Link>
            </div>
          </div>
        </form>
      </div>

      {forgotOpen && (
        <ForgotModal initialEmpId={empId} onClose={() => setForgotOpen(false)} />
      )}
    </div>
  );
}
