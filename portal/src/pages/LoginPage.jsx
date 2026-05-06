import { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

// ===== Pixel-art critters that wander across the login background =====
// Each sprite is a string grid: '.' = transparent, any other char = a color
// from the `palette` map. Rendered as inline SVG <rect>s so they stay crisp
// at any zoom and don't need external assets.
const SPRITES = {
  cat: {
    palette: { O: '#fb923c', D: '#9a3412', P: '#fde68a', K: '#0f172a' },
    grid: [
      '.OO....OO.',
      'OOOOOOOOOO',
      'OPOOOOOOPO',
      'OKOOOOOOKO',
      'OOOOOOOOOO',
      'OOOOOOOOOO',
      'OOOOOOOOOO',
      'OO.OO.OO..',
    ],
  },
  panda: {
    palette: { W: '#ffffff', K: '#1e293b', P: '#fda4af' },
    grid: [
      '.K......K.',
      'KKW....WKK',
      'WKKWWWWKKW',
      'WWKWPPWKWW',
      'WWWWKKWWWW',
      'WWWWWWWWWW',
      'WWWWWWWWWW',
      'KK.KK.KK..',
    ],
  },
  dog: {
    palette: { B: '#a16207', D: '#713f12', P: '#fef3c7', K: '#0f172a' },
    grid: [
      'BB.....BBB',
      'BBBBBBBBBB',
      'BPBBBBBBPB',
      'BKBBBBBBKB',
      'BBBBKKBBBB',
      'BBBBBBBBBB',
      'BBBBBBBBBB',
      'BB.BB.BB..',
    ],
  },
  owl: {
    palette: { B: '#7c3f00', T: '#fbbf24', W: '#fef3c7', K: '#0f172a' },
    grid: [
      'B.B....B.B',
      'BBBBBBBBBB',
      'BWWBBBBWWB',
      'BWKBBBBKWB',
      'BBBBTTBBBB',
      'BWWWWWWWWB',
      'BWBWBWBWWB',
      '.T..T..T..',
    ],
  },
  hamster: {
    palette: { Y: '#fde047', O: '#f59e0b', P: '#fda4af', K: '#0f172a' },
    grid: [
      '.YY....YY.',
      'YYOOOOOOYY',
      'YOPYYYYPOY',
      'YOKYYYYKOY',
      'YOOYYYYOOY',
      'YOOOOOOOOY',
      'YYYYYYYYYY',
      '.O.OO.O...',
    ],
  },
  fox: {
    palette: { F: '#ea580c', D: '#7c2d12', W: '#fef3c7', K: '#0f172a' },
    grid: [
      'FF......FF',
      'FFFFFFFFFF',
      'FWFFFFFFWF',
      'FKFFFFFFKF',
      'FFFFKKFFFF',
      'FFFFFFFFFF',
      'WFFFFFFFFW',
      'FF.FF.FF..',
    ],
  },
};

function Critter({ kind, className, style }) {
  const sprite = SPRITES[kind];
  if (!sprite) return null;
  const w = sprite.grid[0].length;
  const h = sprite.grid.length;
  const rects = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = sprite.grid[y][x];
      if (ch === '.' || !sprite.palette[ch]) continue;
      rects.push(
        <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={sprite.palette[ch]} />
      );
    }
  }
  return (
    <span className={className} style={style}>
      <svg viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" preserveAspectRatio="xMidYMid meet">
        {rects}
      </svg>
    </span>
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
      <div className="critters" aria-hidden="true">
        <Critter kind="cat" className="critter" style={{ top: '82%', animationDuration: '52s' }} />
      </div>
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
