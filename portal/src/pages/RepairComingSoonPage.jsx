import { Link } from 'react-router-dom';

// "Coming soon" page for the Repair / แจ้งซ่อม app. Real app isn't
// built yet — we just want a clear placeholder so the hub card has
// somewhere to land instead of a 404.

export default function RepairComingSoonPage() {
  return (
    <div className="repair-coming-shell">
      <div className="repair-coming-card">
        <div className="repair-coming-art" aria-hidden="true">
          {/* Bench / surface */}
          <div className="rc-shadow" />

          {/* Animated wrench tightening a bolt */}
          <svg viewBox="0 0 240 200" className="rc-svg" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="boltGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#94A3B8" />
                <stop offset="100%" stopColor="#475569" />
              </linearGradient>
              <linearGradient id="wrenchGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#F97316" />
                <stop offset="100%" stopColor="#C2410C" />
              </linearGradient>
              <linearGradient id="screwGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#3B82F6" />
                <stop offset="100%" stopColor="#1E40AF" />
              </linearGradient>
              <radialGradient id="sparkGrad">
                <stop offset="0%" stopColor="#FCD34D" stopOpacity="1" />
                <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Bolt being tightened (centre) */}
            <g className="rc-bolt">
              <polygon
                points="120,80 145,95 145,125 120,140 95,125 95,95"
                fill="url(#boltGrad)"
                stroke="#1F2937" strokeWidth="2"
              />
              <circle cx="120" cy="110" r="8" fill="#1F2937" />
            </g>

            {/* Wrench rotating around the bolt */}
            <g className="rc-wrench" style={{ transformOrigin: '120px 110px' }}>
              <path
                d="M 120 110
                   m 14 -4
                   l 50 -28
                   a 18 18 0 1 1 6 12
                   l -50 28
                   z"
                fill="url(#wrenchGrad)"
                stroke="#7C2D12" strokeWidth="1.5"
              />
              <circle cx="178" cy="80" r="8" fill="#FED7AA" stroke="#7C2D12" strokeWidth="1.5" />
            </g>

            {/* Screwdriver poking from the left */}
            <g className="rc-driver">
              <rect x="20" y="155" width="48" height="9" rx="3" fill="url(#screwGrad)" stroke="#1E3A8A" strokeWidth="1" />
              <rect x="68" y="156" width="40" height="7" fill="#94A3B8" stroke="#475569" strokeWidth="0.6" />
              <polygon points="108,156 116,159.5 108,163" fill="#64748B" />
            </g>

            {/* Sparks */}
            <g className="rc-sparks">
              <circle className="rc-spark rc-spark-1" cx="155" cy="100" r="4" fill="url(#sparkGrad)" />
              <circle className="rc-spark rc-spark-2" cx="100" cy="105" r="3" fill="url(#sparkGrad)" />
              <circle className="rc-spark rc-spark-3" cx="135" cy="125" r="3.5" fill="url(#sparkGrad)" />
            </g>
          </svg>
        </div>

        <div className="repair-coming-text">
          <div className="rc-kicker">
            <span className="rc-pulse" /> เร็วๆ นี้
          </div>
          <h1 className="rc-title">🛠️ กำลังปรับปรุง App</h1>
          <p className="rc-sub">
            ระบบ <b>แจ้งซ่อมของพนักงาน</b> กำลังพัฒนาอยู่ — ช่างกำลังขันน็อตให้พร้อมใช้งานเร็วๆ นี้ครับ
          </p>

          <div className="rc-features">
            <div className="rc-feature">
              <span className="rc-feature-icon">📝</span>
              <div>
                <b>แจ้งซ่อม</b>
                <small>ส่งคำขอซ่อมพร้อมรูป + รายละเอียด</small>
              </div>
            </div>
            <div className="rc-feature">
              <span className="rc-feature-icon">🔧</span>
              <div>
                <b>ติดตามสถานะ</b>
                <small>รอตรวจ → กำลังซ่อม → เสร็จ — ดูได้ทุกขั้น</small>
              </div>
            </div>
            <div className="rc-feature">
              <span className="rc-feature-icon">📦</span>
              <div>
                <b>เบิก/ยืม/ซื้ออะไหล่</b>
                <small>ระบบจัดการเอกสารครบ จบในที่เดียว</small>
              </div>
            </div>
          </div>

          <Link to="/hub" className="rc-back">
            ← กลับหน้าหลัก
          </Link>
        </div>
      </div>
    </div>
  );
}
