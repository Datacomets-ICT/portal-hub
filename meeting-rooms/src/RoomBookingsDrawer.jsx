// RoomBookingsDrawer — side panel listing all bookings for ONE room on the
// current view date. Reuses the .cal-drawer-* classes from BookingsHistoryView
// so the styling is consistent across the app.
import { fmtTimeColon } from './components.jsx';

const THAI_MONTHS_LONG = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function normName(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

export default function RoomBookingsDrawer({
  room,
  date,           // Date object — currentDate from App
  bookings,       // array of booking objects already filtered to today
  empByName,      // map keyed by normalized name → employee
  currentUser,
  onClose,
  onEditBooking,
}) {
  if (!room || !date) return null;

  // Bookings for THIS room on this date, sorted by start
  const rows = (bookings || [])
    .filter((b) => b.roomId === room.id)
    .slice()
    .sort((a, b) => a.start - b.start);

  const dateLabel = `วัน${
    ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'][date.getDay()]
  }ที่ ${date.getDate()} ${THAI_MONTHS_LONG[date.getMonth()]} ${date.getFullYear() + 543}`;

  return (
    <div className="cal-drawer-backdrop" onClick={onClose}>
      <aside className="cal-drawer" onClick={(e) => e.stopPropagation()}>
        <header className="cal-drawer-head">
          <div>
            <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 4 }}>
              📋 ตารางการประชุม · {room.location} · {room.floor || '—'}
            </div>
            <h2>{room.name} <span style={{ color: 'var(--fg-3)', fontWeight: 400, fontSize: 13 }}>({room.id})</span></h2>
            <div className="cal-drawer-sub">{dateLabel} · {rows.length} การจอง</div>
          </div>
          <button className="cal-drawer-close" onClick={onClose} aria-label="ปิด">✕</button>
        </header>

        <section className="room-detail-panel">
          {room.picture && (
            <div
              className="room-detail-photo"
              style={{ backgroundImage: `url(${room.picture})` }}
            />
          )}
          <div className="room-detail-meta">
            <span className="room-detail-meta-item">👥 {room.seats || 0} ที่นั่ง</span>
            {room.floor && <span className="room-detail-meta-item">🏢 {room.floor}</span>}
            <span className="room-detail-meta-item">📍 {room.location}</span>
          </div>
          {room.description && (
            <p className="room-detail-desc">{room.description}</p>
          )}
          <div className="room-detail-block">
            <div className="room-detail-block-h">🛠 อุปกรณ์ในห้อง</div>
            {Array.isArray(room.equipment) && room.equipment.length > 0 ? (
              <div className="room-detail-chips">
                {room.equipment.map((e) => (
                  <span key={e} className="room-detail-chip">{e}</span>
                ))}
              </div>
            ) : (
              <div className="room-detail-empty">ยังไม่ได้ระบุอุปกรณ์</div>
            )}
          </div>
          <div className="room-detail-block">
            <div className="room-detail-block-h">🎯 เหมาะสำหรับ</div>
            {Array.isArray(room.purposes) && room.purposes.length > 0 ? (
              <div className="room-detail-chips">
                {room.purposes.map((p) => (
                  <span key={p} className="room-detail-chip accent">{p}</span>
                ))}
              </div>
            ) : (
              <div className="room-detail-empty">รับทุกวัตถุประสงค์</div>
            )}
          </div>
        </section>

        <div className="room-detail-divider">
          <span>📅 การจองวันนี้</span>
        </div>

        {rows.length === 0 ? (
          <div className="view-empty" style={{ margin: 16 }}>ไม่มีการจองในห้องนี้</div>
        ) : (
          <div className="cal-drawer-list">
            {rows.map((b) => {
              const normBooker = normName(b.booker);
              const emp = empByName ? empByName[normBooker.toLowerCase()] || empByName[normBooker] : null;
              const isMine = normBooker === normName(currentUser?.name || '');
              const role = emp?.position || emp?.dept;
              const bookerLabel = emp
                ? `${emp.name}${emp.nickname ? ` (${emp.nickname})` : ''}${role ? ` · ${role}` : ''}`
                : normBooker || '—';

              const inner = (
                <>
                  <div className="cdi-time mono">
                    {fmtTimeColon(b.start)}<br />
                    <span>{fmtTimeColon(b.end)}</span>
                  </div>
                  <div className="cdi-bar" />
                  <div className="cdi-main">
                    <div className="cdi-title">
                      {isMine ? b.title : 'การประชุม'}
                      {isMine && <span className="bc-mine-tag">ของคุณ</span>}
                      {!isMine && <span className="bc-other-tag">ดูเท่านั้น</span>}
                    </div>
                    <div className="cdi-chips">
                      <span className="cdi-chip">👤 {bookerLabel}</span>
                      {b.attendees > 0 && <span className="cdi-chip">👥 {b.attendees}</span>}
                      {isMine && b.purpose && <span className="cdi-chip">🎯 {b.purpose}</span>}
                    </div>
                  </div>
                </>
              );

              return isMine ? (
                <button
                  key={b.id}
                  className="cal-drawer-item is-mine"
                  onClick={() => onEditBooking && onEditBooking(b, room)}
                >
                  {inner}
                </button>
              ) : (
                <div key={b.id} className="cal-drawer-item is-other">
                  {inner}
                </div>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}
