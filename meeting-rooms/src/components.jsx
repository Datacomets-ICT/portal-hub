import { useState, useEffect, useRef } from 'react';
import MeetingSummaryPanel from './MeetingSummaryPanel.jsx';
import { supabase } from './lib/supabase.js';

export const DAY_START = 8 * 60 + 30;   // 08:30
export const DAY_END = 20 * 60 + 30;    // 20:30
export const SLOT = 30;

export const fmtTime = (m) => {
  const h = Math.floor(m / 60), mm = m % 60;
  return `${String(h).padStart(2, '0')}.${String(mm).padStart(2, '0')}`;
};
export const fmtTimeColon = (m) => {
  const h = Math.floor(m / 60), mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};
export const pctFromMin = (m) => ((m - DAY_START) / (DAY_END - DAY_START)) * 100;

// Whitespace + case tolerant name match — old bookings can have stray
// spaces in `booker` that would otherwise fail an exact === lookup.
const normName = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
export const findEmpByName = (employees, name) => {
  const want = normName(name);
  return employees.find((e) => normName(e.name) === want);
};

export const THAI_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
export const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const fmtDayLabel = (d) => `${THAI_DAYS[d.getDay()]} ${d.getDate()} ${THAI_MONTHS[d.getMonth()]}`;
export const fmtDateLong = (d) =>
  `วัน${['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'][d.getDay()]} ${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;

export function TimelineHeader({ inline = false }) {
  const hours = [];
  for (let h = DAY_START / 60; h <= DAY_END / 60; h++) hours.push(h);
  return (
    <div className={`tl-header ${inline ? 'inline' : ''}`}>
      {hours.map((h) => (
        <div key={h} className="tl-tick" style={{ left: `${pctFromMin(h * 60)}%` }}>
          <span className="tl-tick-label">{String(h).padStart(2, '0')}.00</span>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// CardTimeline — thin inline availability bar used inside RoomCard
// ───────────────────────────────────────────────────────────
export function CardTimeline({ room, bookings, onSlotClick, onEventClick, currentMin, isToday, currentUser }) {
  const barRef = useRef(null);
  const [hoverX, setHoverX] = useState(null);

  const handleMove = (e) => {
    const rect = barRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const pct = x / rect.width;
    const minute = DAY_START + pct * (DAY_END - DAY_START);
    const snapped = Math.round(minute / SLOT) * SLOT;
    setHoverX(snapped);
  };
  const handleLeave = () => setHoverX(null);

  const handleClick = (e) => {
    e.stopPropagation();
    if (hoverX == null) return;
    const start = hoverX;
    const end = Math.min(DAY_END, start + 60);
    const conflict = bookings.some((b) => !(b.end <= start || b.start >= end));
    if (conflict) return;
    onSlotClick(room, start, end);
  };

  // Gridlines every 2 hours (08, 10, 12, 14, 16, 18)
  const majorHours = [8, 10, 12, 14, 16, 18];

  return (
    <div
      ref={barRef}
      className="card-tl"
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={handleClick}
    >
      <div className="card-tl-gridlines">
        {majorHours.map((h) => (
          <div
            key={h}
            className="card-tl-grid"
            style={{ left: `${pctFromMin(h * 60)}%` }}
          />
        ))}
      </div>

      {bookings.map((b) => {
        const left = Math.max(0, pctFromMin(b.start));
        const right = Math.min(100, pctFromMin(b.end));
        const width = right - left;
        if (width <= 0) return null;
        const normBooker = (b.booker || '').replace(/\s+/g, ' ').trim();
        const normUser = (currentUser?.name || '').replace(/\s+/g, ' ').trim();
        const isMine = !!normUser && normBooker === normUser;
        const label = isMine ? b.title : (normBooker || 'มีการจอง');
        const tooltip = isMine
          ? `${fmtTimeColon(b.start)}–${fmtTimeColon(b.end)} · ${b.title}`
          : `${fmtTimeColon(b.start)}–${fmtTimeColon(b.end)} · จองโดย ${normBooker || '—'}`;
        return (
          <div
            key={b.id}
            className={`card-tl-event${isMine ? '' : ' is-other'}`}
            style={{ left: `${left}%`, width: `${width}%` }}
            onClick={(e) => {
              e.stopPropagation();
              if (!isMine) return;
              onEventClick(b, room);
            }}
            title={tooltip}
          >
            <span className="card-tl-event-title">{label}</span>
          </div>
        );
      })}

      {isToday && currentMin >= DAY_START && currentMin <= DAY_END && (
        <div className="card-tl-now" style={{ left: `${pctFromMin(currentMin)}%` }} />
      )}

      {hoverX != null && (
        <div
          className="card-tl-ghost"
          style={{
            left: `${pctFromMin(hoverX)}%`,
            width: `${pctFromMin(hoverX + 60) - pctFromMin(hoverX)}%`,
          }}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// RoomCard — grid tile: header + photo + status + mini timeline
// ───────────────────────────────────────────────────────────
// Axis labels for the mini timeline — positioned by percent within DAY_START..DAY_END.
// Skip edge labels to avoid overlap with the 09 / 19 ticks.
const AXIS_HOURS = [9, 11, 13, 15, 17, 19];

export function RoomCard({ room, bookings, onSlotClick, onEventClick, currentMin, isToday, currentUser, onShowRoomBookings }) {
  const available = room.status === 'available';
  const occupiedNow =
    isToday && bookings.some((b) => currentMin >= b.start && currentMin < b.end);

  const cardClickable = !!onShowRoomBookings;
  const openRoom = (e) => {
    if (!cardClickable) return;
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    onShowRoomBookings(room);
  };

  return (
    <article
      className={`room-card${cardClickable ? ' room-card-clickable' : ''}`}
      onClick={cardClickable ? openRoom : undefined}
      role={cardClickable ? 'button' : undefined}
      tabIndex={cardClickable ? 0 : undefined}
      onKeyDown={cardClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRoom(e); } } : undefined}
      title={cardClickable ? 'ดูตารางของห้องนี้' : undefined}
    >
      <header className="rc-head">
        <div className="rc-loc">{room.location}</div>
        <div className="rc-id-name">
          <span className="rc-id mono">{room.id}</span>
          <span className="rc-name-small">{room.name}</span>
        </div>
      </header>

      <div className="rc-photo" style={{ backgroundImage: `url(${room.picture})` }}>
        {occupiedNow && <div className="rc-occupied-badge">ใช้งานอยู่</div>}
        {onShowRoomBookings && bookings.length > 0 && (
          <button
            type="button"
            className="rc-bookings-btn"
            onClick={(e) => { e.stopPropagation(); onShowRoomBookings(room); }}
            title="ดูตารางของห้องนี้"
          >
            📋 {bookings.length} การจอง
          </button>
        )}
      </div>

      <div className="rc-body">
        <button
          type="button"
          className="rc-title rc-title-btn"
          onClick={(e) => { e.stopPropagation(); onShowRoomBookings && onShowRoomBookings(room); }}
          title="ดูตารางของห้องนี้"
        >
          {room.name}
        </button>
        <div className="rc-meta">
          <span className={`rc-status ${available ? 'ok' : 'off'}`}>
            <span className="rc-dot" /> {available ? 'available' : 'unavailable'}
          </span>
          <span className="rc-sep">·</span>
          <span>{room.seats} ที่นั่ง</span>
          {room.floor && (
            <>
              <span className="rc-sep">·</span>
              <span>{room.floor}</span>
            </>
          )}
        </div>

        <div className="card-tl-wrap">
          <div className="card-tl-axis">
            {AXIS_HOURS.map((h) => (
              <span
                key={h}
                className="mono axis-mid"
                style={{ left: `${pctFromMin(h * 60)}%` }}
              >
                {String(h).padStart(2, '0')}
              </span>
            ))}
          </div>
          <CardTimeline
            room={room}
            bookings={bookings}
            onSlotClick={onSlotClick}
            onEventClick={onEventClick}
            currentMin={currentMin}
            isToday={isToday}
            currentUser={currentUser}
          />
          <div className="card-tl-range mono">
            {fmtTimeColon(DAY_START)} – {fmtTimeColon(DAY_END)}
          </div>
        </div>
      </div>
    </article>
  );
}

export function TimelineRow({ room, bookings, onSlotClick, onEventClick, currentMin, isToday, density = 'comfort' }) {
  const rowRef = useRef(null);
  const [hoverX, setHoverX] = useState(null);

  const handleMove = (e) => {
    const rect = rowRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const pct = x / rect.width;
    const minute = DAY_START + pct * (DAY_END - DAY_START);
    const snapped = Math.round(minute / SLOT) * SLOT;
    setHoverX(snapped);
  };
  const handleLeave = () => setHoverX(null);

  const handleClick = () => {
    if (hoverX == null) return;
    const start = hoverX;
    const end = Math.min(DAY_END, start + 60);
    const conflict = bookings.some((b) => !(b.end <= start || b.start >= end));
    if (conflict) return;
    onSlotClick(room, start, end);
  };

  const rowHeight = density === 'compact' ? 64 : density === 'cozy' ? 84 : 108;

  return (
    <div className="tl-row-wrap">
      <div
        ref={rowRef}
        className="tl-row"
        style={{ height: rowHeight, backgroundImage: `url(${room.picture})` }}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        onClick={handleClick}
        data-room-id={room.id}
      >
        <div className="tl-row-veil" />

        <div className="tl-gridlines">
          {Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => (
            <div key={i} className="tl-gridline" style={{ left: `${(i / ((DAY_END - DAY_START) / 60)) * 100}%` }} />
          ))}
        </div>

        <div className="tl-room-label">
          <div className="tl-room-name">{room.name}</div>
          <div className="tl-room-meta">
            <span className="tl-room-id">{room.id}</span>
            <span className="tl-dot" />
            <span>{room.location}</span>
            <span className="tl-dot" />
            <span>{room.seats} ที่นั่ง</span>
          </div>
        </div>

        {bookings.map((b) => {
          const left = pctFromMin(b.start);
          const width = pctFromMin(b.end) - left;
          return (
            <div
              key={b.id}
              className="tl-event"
              style={{ left: `${left}%`, width: `${width}%` }}
              onClick={(e) => { e.stopPropagation(); onEventClick(b, room); }}
            >
              <div className="tl-event-inner">
                <div className="tl-event-title">{b.title}</div>
                <div className="tl-event-time">{fmtTimeColon(b.start)}–{fmtTimeColon(b.end)} · {b.booker}</div>
              </div>
            </div>
          );
        })}

        {isToday && currentMin >= DAY_START && currentMin <= DAY_END && (
          <div className="tl-now" style={{ left: `${pctFromMin(currentMin)}%` }} />
        )}

        {hoverX != null && (
          <div
            className="tl-ghost"
            style={{ left: `${pctFromMin(hoverX)}%`, width: `${pctFromMin(hoverX + 60) - pctFromMin(hoverX)}%` }}
          >
            <span className="tl-ghost-label">+ จอง {fmtTimeColon(hoverX)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// ModalTimeline — visual timeline inside BookingModal showing:
//   • existing bookings of this room+date (gray blocks)
//   • the user's currently-selected time range (green border, or red if conflict)
// ───────────────────────────────────────────────────────────
function ModalTimeline({
  roomBookings,
  selectedStart,
  selectedEnd,
  hasConflict,
  activeDetailsId,
  onEventClick,
}) {
  const axisHours = [9, 11, 13, 15, 17, 19];
  const selLeft = Math.max(0, pctFromMin(selectedStart));
  const selRight = Math.min(100, pctFromMin(selectedEnd));
  const selWidth = Math.max(0, selRight - selLeft);
  return (
    <div className="mt-wrap">
      <div className="mt-label">
        ภาพรวมการใช้ห้องในวันนี้ · ช่วงที่จะจอง:{' '}
        <span className={hasConflict ? 'mt-sel-text conflict' : 'mt-sel-text'}>
          {fmtTimeColon(selectedStart)}–{fmtTimeColon(selectedEnd)}
        </span>
      </div>
      <div className="mt-axis mono">
        {axisHours.map((h) => (
          <span key={h} style={{ left: `${pctFromMin(h * 60)}%` }}>
            {String(h).padStart(2, '0')}
          </span>
        ))}
      </div>
      <div className="mt-bar">
        {/* hour gridlines */}
        {axisHours.map((h) => (
          <div
            key={h}
            className="mt-grid"
            style={{ left: `${pctFromMin(h * 60)}%` }}
          />
        ))}
        {/* existing bookings (click to see who booked it) */}
        {roomBookings.map((b) => {
          const left = Math.max(0, pctFromMin(b.start));
          const right = Math.min(100, pctFromMin(b.end));
          const width = right - left;
          if (width <= 0) return null;
          const isActive = activeDetailsId === b.id;
          return (
            <button
              key={b.id}
              type="button"
              className={`mt-event ${isActive ? 'active' : ''}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              onClick={(e) => {
                e.stopPropagation();
                onEventClick?.(b);
              }}
              title={`คลิกเพื่อดูรายละเอียด — ${fmtTimeColon(b.start)}–${fmtTimeColon(b.end)}`}
            >
              <span className="mt-event-title">{b.title}</span>
            </button>
          );
        })}
        {/* user's selection */}
        {selWidth > 0 && (
          <div
            className={`mt-selection ${hasConflict ? 'conflict' : 'ok'}`}
            style={{ left: `${selLeft}%`, width: `${selWidth}%` }}
          >
            <span className="mono">
              {fmtTimeColon(selectedStart)}–{fmtTimeColon(selectedEnd)}
            </span>
          </div>
        )}
      </div>
      <div className="mt-legend">
        <span><span className="mt-sw mt-sw-event" /> จองแล้ว (คลิกดูได้)</span>
        <span><span className="mt-sw mt-sw-ok" /> คุณจะจอง</span>
        <span><span className="mt-sw mt-sw-conflict" /> ทับกัน</span>
      </div>
    </div>
  );
}

// Click an existing booking in the modal timeline → render this inline card.
// Styling matches the .cal-drawer-item rows in BookingsHistoryView so the
// "ดูข้อมูลคนจอง" look and feel is consistent across the app.
function BookingDetailsCard({ booking, employee, onClose, currentUser, room }) {
  const isMine = currentUser?.name
    && normName(booking.booker) === normName(currentUser.name);
  const role = employee?.position || employee?.dept;
  const bookerLabel = employee
    ? `${employee.name}${employee.nickname ? ` (${employee.nickname})` : ''}${role ? ` · ${role}` : ''}`
    : (booking.booker || '—');

  return (
    <div className="mt-details-wrap">
      <button
        type="button"
        className="mt-details-close-floating"
        onClick={onClose}
        aria-label="ปิด"
      >
        ✕
      </button>
      <div className={`cal-drawer-item ${isMine ? 'is-mine' : 'is-other'}`} style={{ cursor: 'default' }}>
        <div className="cdi-time mono">
          {fmtTimeColon(booking.start)}<br />
          <span>{fmtTimeColon(booking.end)}</span>
        </div>
        <div className="cdi-bar" />
        <div className="cdi-main">
          <div className="cdi-title">
            {isMine ? booking.title : 'การประชุม'}
            {isMine && <span className="bc-mine-tag">ของคุณ</span>}
            {!isMine && <span className="bc-other-tag">ดูเท่านั้น</span>}
          </div>
          {room && (
            <div className="cdi-room">
              {room.name || booking.roomId}
              <span className="cdi-room-meta"> · {room.location || ''}{room.floor ? ` · ${room.floor}` : ''}</span>
            </div>
          )}
          <div className="cdi-chips">
            <span className="cdi-chip">👤 {bookerLabel}</span>
            {employee?.code && <span className="cdi-chip mono">รหัส {employee.code}</span>}
            {employee?.company && <span className="cdi-chip">🏢 {employee.company}</span>}
            {booking.attendees > 0 && <span className="cdi-chip">👥 {booking.attendees}</span>}
            {isMine && booking.purpose && <span className="cdi-chip">🎯 {booking.purpose}</span>}
          </div>
          {!employee && (
            <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 6, fontStyle: 'italic' }}>
              (ไม่พบในทะเบียนพนักงานปัจจุบัน — อาจเป็น booking เก่า)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Own-booking only: shows the attendee list + attached files inside the
// booking modal so the owner can review them without opening the popout
// meeting window. Pulls fresh from the same RPCs the popout uses.
function BookingAttendeesAndFiles({ booking, isPast = false }) {
  const bookingId = booking?.id;
  const [attendees, setAttendees] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bookingId) return;
    let alive = true;
    setLoading(true);
    Promise.all([
      supabase.rpc('mtg_list_attendees', { p_booking_id: bookingId }),
      supabase.rpc('mtg_list_attachments', { p_booking_id: bookingId }),
    ]).then(async ([attRes, fileRes]) => {
      const baseFiles = fileRes.data || [];
      // Mint fresh signed URLs (bucket is private)
      const filesWithSigned = await Promise.all(baseFiles.map(async (f) => {
        if (!f.storage_path) return f;
        try {
          const { data } = await supabase.storage
            .from('meeting-files')
            .createSignedUrl(f.storage_path, 3600);
          return { ...f, signed_url: data?.signedUrl || '' };
        } catch { return f; }
      }));
      if (!alive) return;
      setAttendees(attRes.data || []);
      setFiles(filesWithSigned);
      setLoading(false);
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [bookingId]);

  if (loading && attendees.length === 0 && files.length === 0 && !isPast) return null;
  if (attendees.length === 0 && files.length === 0 && !isPast) return null;

  return (
    <div className="bm-extra">
      {attendees.length > 0 && (
        <section className="bm-extra-section">
          <div className="bm-extra-head">👥 ผู้เข้าร่วม ({attendees.length} คน)</div>
          <ul className="bm-attendee-list">
            {attendees.map((a) => {
              const fullName = [a.first_name, a.last_name].filter(Boolean).join(' ') || a.employee_id;
              const sub = [a.position, a.department].filter(Boolean).join(' · ');
              const initial = ([a.nickname, a.first_name, a.employee_id, '?']
                .map((s) => (s || '').trim()).find(Boolean) || '?').charAt(0).toUpperCase();
              // Once the meeting is past, an unanswered invite is treated
              // as "didn't attend" (instead of the inviting "รอตอบ") so the
              // booker sees the real attendance outcome.
              const effectiveStatus = isPast && a.status === 'invited' ? 'noshow' : a.status;
              const statusLabel = effectiveStatus === 'joined'   ? 'เข้าร่วม'
                : effectiveStatus === 'declined' ? 'ปฏิเสธ'
                : effectiveStatus === 'noshow'   ? 'ไม่เข้าร่วมประชุม'
                : 'รอตอบ';
              return (
                <li key={a.employee_id} className={`bm-attendee bm-attendee-${effectiveStatus}`}>
                  <div className="bm-attendee-avatar">{initial}</div>
                  <div className="bm-attendee-info">
                    <div className="bm-attendee-name">
                      {fullName}
                      {a.nickname && <span className="bm-attendee-nick"> ({a.nickname})</span>}
                    </div>
                    {sub && <div className="bm-attendee-sub">{sub}</div>}
                  </div>
                  <span className={`bm-attendee-status bm-status-${effectiveStatus}`}>{statusLabel}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {files.length > 0 && (
        <section className="bm-extra-section">
          <div className="bm-extra-head">📎 ไฟล์แนบ ({files.length})</div>
          <ul className="bm-file-list">
            {files.map((f) => (
              <li key={f.id} className="bm-file-item">
                <span className="bm-file-icon">📄</span>
                <a
                  className="bm-file-link"
                  href={f.signed_url || f.public_url || '#'}
                  target="_blank"
                  rel="noreferrer"
                  title="ลิงก์หมดอายุใน 1 ชั่วโมง — refresh หน้านี้ถ้าโหลดไม่ได้"
                >
                  {f.file_name}
                </a>
                <span className="bm-file-meta">
                  {f.size_bytes ? `${(f.size_bytes / 1024).toFixed(0)} KB · ` : ''}{f.uploader_name}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isPast && (
        <section className="bm-extra-section">
          <div className="bm-extra-head">🤖 สรุปการประชุม (AI)</div>
          <div className="bm-summary-wip">
            <div className="bm-summary-wip-icon">🚧</div>
            <div>
              <div className="bm-summary-wip-title">ระบบกำลังพัฒนา</div>
              <div className="bm-summary-wip-desc">
                การสรุปประชุมอัตโนมัติยังอยู่ระหว่างการพัฒนา — เร็ว ๆ นี้
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export function BookingModal({ open, onClose, onSave, room, date, initial, employees = [], roomBookings = [], currentUser = null, onJoinMeeting = null }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [start, setStart] = useState(initial?.start ?? 9 * 60);
  const [end, setEnd] = useState(initial?.end ?? 10 * 60);
  const [booker, setBooker] = useState(initial?.booker || '');
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [bookerQuery, setBookerQuery] = useState('');
  const [bookerOpen, setBookerOpen] = useState(false);
  const [attendees, setAttendees] = useState(initial?.attendees || 4);
  const [purpose, setPurpose] = useState(initial?.purpose || 'ประชุมภายใน');
  const [company, setCompany] = useState(initial?.company || '');
  const [equipment, setEquipment] = useState(initial?.equipment || []);
  const [refreshments, setRefreshments] = useState(initial?.refreshments || []);
  const [customerCount, setCustomerCount] = useState(initial?.customerCount || 0);
  const [detailsBooking, setDetailsBooking] = useState(null);

  useEffect(() => {
    if (open) {
      setTitle(initial?.title || '');
      setStart(initial?.start ?? 9 * 60);
      setEnd(initial?.end ?? 10 * 60);
      // Booker is always the signed-in user — never editable.
      // For NEW bookings (no initial.id) → currentUser. For EDIT, prefer
      // the original booker (so we don't overwrite who actually booked
      // it just because someone else is editing).
      let lockedBooker = null;
      if (initial?.id && initial?.booker) {
        // Prefer the signed-in user when they ARE the booker — avoids
        // depending on the mtg_employees view at all for the common case.
        const sameAsMe = currentUser
          && normName(currentUser.name) === normName(initial.booker);
        if (sameAsMe) {
          lockedBooker = {
            code: currentUser.code,
            name: currentUser.name,
            nickname: currentUser.nickname || '',
            dept: currentUser.dept || '',
            position: currentUser.position || '',
          };
        } else {
          lockedBooker = findEmpByName(employees, initial.booker)
            || { code: '?', name: initial.booker, nickname: '', dept: '' };
        }
      } else if (currentUser) {
        lockedBooker = {
          code: currentUser.code,
          name: currentUser.name,
          nickname: currentUser.nickname || '',
          dept: currentUser.dept || '',
          position: currentUser.position || '',
        };
      }
      setSelectedEmp(lockedBooker);
      setBooker(lockedBooker?.name || '');
      setBookerQuery('');
      setAttendees(initial?.attendees || 4);
      setPurpose(initial?.purpose || 'ประชุมภายใน');
      setCompany(initial?.company || '');
      setEquipment(initial?.equipment || []);
      setRefreshments(initial?.refreshments || []);
      setCustomerCount(initial?.customerCount || 0);
      setDetailsBooking(null);
    }
  }, [open, initial?.id, employees, currentUser]);

  if (!open || !room) return null;

  const timeOptions = [];
  for (let m = DAY_START; m <= DAY_END; m += 15) timeOptions.push(m);

  const toggleEquip = (k) =>
    setEquipment((e) => (e.includes(k) ? e.filter((x) => x !== k) : [...e, k]));
  const toggleRefresh = (k) =>
    setRefreshments((r) => (r.includes(k) ? r.filter((x) => x !== k) : [...r, k]));

  const conflicts = roomBookings.filter(
    (b) => !(b.end <= start || b.start >= end)
  );
  const hasConflict = conflicts.length > 0;

  // Past bookings can't be edited or cancelled — only the meeting summary
  // panel stays interactive. Compare the booking's end time (date + end_min)
  // to "now". For new bookings (no initial.id) this is always false.
  const isPast = (() => {
    if (!initial?.id || !date) return false;
    try {
      const baseDate = new Date(date);
      const initialEnd = initial.end ?? end;
      const endTime = new Date(
        baseDate.getFullYear(),
        baseDate.getMonth(),
        baseDate.getDate(),
        Math.floor(initialEnd / 60),
        initialEnd % 60
      );
      return endTime.getTime() < Date.now();
    } catch { return false; }
  })();

  // Once the meeting STARTS (but isn't past yet), lock the core slot
  // fields — start / end / attendee count / purpose — but leave title
  // editable and let invitees still be added via the popout meeting
  // window. Past meetings are already covered by isPast.
  const isStarted = (() => {
    if (!initial?.id || !date) return false;
    try {
      const baseDate = new Date(date);
      const initialStart = initial.start ?? start;
      const startTime = new Date(
        baseDate.getFullYear(),
        baseDate.getMonth(),
        baseDate.getDate(),
        Math.floor(initialStart / 60),
        initialStart % 60
      );
      return startTime.getTime() <= Date.now();
    } catch { return false; }
  })();
  const lockSlot = isPast || isStarted;

  const canSave = title.trim() && booker.trim() && end > start && !hasConflict && !isPast;

  const filteredEmp = employees
    .filter((e) => {
      const q = bookerQuery.toLowerCase();
      return !q || e.name.toLowerCase().includes(q) || (e.nickname || '').toLowerCase().includes(q) || (e.code || '').includes(q);
    })
    .slice(0, 6);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-head-img" style={{ backgroundImage: `url(${room.picture})` }} />
          <div className="modal-head-overlay" />
          <div className="modal-head-text">
            <div className="modal-kicker">จองห้องประชุม · {fmtDateLong(date)}</div>
            <div className="modal-room-name">{room.name}</div>
            <div className="modal-room-meta">
              <span>{room.id}</span><span>·</span>
              <span>{room.location} · {room.floor}</span><span>·</span>
              <span>{room.seats} ที่นั่ง</span>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {isPast && (
            <div className="past-meeting-banner">
              ⏱ <b>ประชุมผ่านไปแล้ว</b> — แก้ไขรายละเอียดไม่ได้
            </div>
          )}
          <fieldset className="booking-form-fields" disabled={isPast}>
          <label className="field field-full">
            <span className="field-label">หัวข้อการประชุม{isPast && <em style={{fontWeight:400,fontSize:11,color:'#9aa7bd',marginLeft:6}}>(ล็อก — ประชุมผ่านไปแล้ว)</em>}</span>
            <input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น Weekly Sync, Product Review" autoFocus readOnly={isPast} style={isPast ? {background:'var(--surface-2)',cursor:'not-allowed'} : undefined} />
          </label>

          {isStarted && !isPast && (
            <div className="mt-locked-banner">
              ⏱ <b>ประชุมเริ่มแล้ว</b> — เวลาเริ่ม/สิ้นสุด · จำนวนคน · วัตถุประสงค์ แก้ไม่ได้แล้ว (เชิญคนเพิ่มได้ผ่าน "เข้าร่วมประชุม")
            </div>
          )}

          <div className="field-row">
            <label className="field">
              <span className="field-label">เริ่ม</span>
              <select className="field-input" value={start} onChange={(e) => setStart(+e.target.value)} disabled={lockSlot}>
                {timeOptions.filter((t) => t < DAY_END).map((t) => <option key={t} value={t}>{fmtTimeColon(t)}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">สิ้นสุด</span>
              <select className="field-input" value={end} onChange={(e) => setEnd(+e.target.value)} disabled={lockSlot}>
                {timeOptions.filter((t) => t > start).map((t) => <option key={t} value={t}>{fmtTimeColon(t)}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">จำนวนคน</span>
              <input type="number" className="field-input" min={1} max={room.seats} value={attendees} onChange={(e) => setAttendees(+e.target.value)} disabled={lockSlot} />
            </label>
          </div>

          <ModalTimeline
            roomBookings={roomBookings}
            selectedStart={start}
            selectedEnd={end}
            hasConflict={hasConflict}
            activeDetailsId={detailsBooking?.id}
            onEventClick={(b) =>
              setDetailsBooking((prev) => (prev?.id === b.id ? null : b))
            }
          />

          {detailsBooking && (
            <BookingDetailsCard
              booking={detailsBooking}
              employee={findEmpByName(employees, detailsBooking.booker)}
              currentUser={currentUser}
              room={room}
              onClose={() => setDetailsBooking(null)}
            />
          )}

          <div className="field field-full combo">
            <span className="field-label">ผู้จอง</span>
            {selectedEmp ? (
              <div className="booker-card">
                <div className="booker-avatar">{(selectedEmp.nickname || selectedEmp.name)[0]}</div>
                <div className="booker-info">
                  <div className="booker-name">
                    {selectedEmp.name}
                    {selectedEmp.nickname && (
                      <span className="booker-nick"> ({selectedEmp.nickname})</span>
                    )}
                  </div>
                  <div className="booker-meta">
                    รหัส {selectedEmp.code}
                    {selectedEmp.dept && <> · {selectedEmp.dept}</>}
                  </div>
                  {selectedEmp.position && (
                    <div className="booker-pos">{selectedEmp.position}</div>
                  )}
                </div>
                {/* Booker is locked to the signed-in user — no clear button.
                    Past edits keep the original booker (read-only). */}
              </div>
            ) : (
              <div className="field-input" style={{opacity:0.6}}>
                ไม่พบข้อมูลผู้จอง
              </div>
            )}
          </div>

          <div className="field-row">
            <label className="field">
              <span className="field-label">วัตถุประสงค์{isPast && <em style={{fontWeight:400,fontSize:11,color:'#9aa7bd',marginLeft:6}}>(ล็อก)</em>}</span>
              <select className="field-input" value={purpose} onChange={(e) => setPurpose(e.target.value)} disabled={lockSlot} style={lockSlot ? {background:'var(--surface-2)',cursor:'not-allowed'} : undefined}>
                <option>ประชุมภายใน</option>
                <option>รับรองลูกค้า</option>
                <option>สัมภาษณ์งาน</option>
                <option>Workshop</option>
                <option>อัดคลิป</option>
                <option>อบรม</option>
              </select>
            </label>
            {purpose === 'รับรองลูกค้า' && (
              <>
                <label className="field field-grow">
                  <span className="field-label">ชื่อบริษัท</span>
                  <input
                    className="field-input"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="บริษัทผู้มาเยี่ยม"
                  />
                </label>
                <label className="field">
                  <span className="field-label">จำนวนลูกค้า</span>
                  <input
                    type="number"
                    className="field-input"
                    min={0}
                    value={customerCount}
                    onChange={(e) => setCustomerCount(+e.target.value)}
                    placeholder="0"
                  />
                </label>
              </>
            )}
          </div>

          {purpose === 'รับรองลูกค้า' && (
            <div className="field field-full">
              <span className="field-label">เตรียมของรับรอง</span>
              <div className="chip-row">
                {['อาหารว่าง', 'เครื่องดื่ม', 'ขนม', 'ผลไม้', 'อาหารกลางวัน', 'ของที่ระลึก'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`chip ${refreshments.includes(k) ? 'chip-on' : ''}`}
                    onClick={() => toggleRefresh(k)}
                  >
                    {refreshments.includes(k) && <span className="chip-check">✓</span>}{k}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* "อุปกรณ์เสริม" section removed — each room advertises its
              built-in equipment list on the room card; per-booking
              selection was redundant. */}

          {hasConflict && (
            <div className="conflict-warn">
              ⚠ ช่วงเวลานี้ชนกับ <b>"{conflicts[0].title}"</b>{' '}
              ({fmtTimeColon(conflicts[0].start)}–{fmtTimeColon(conflicts[0].end)}) —
              โปรดเลือกเวลาใหม่
            </div>
          )}

          </fieldset>

          {/* Own-booking only: attendees + attachments overview so the
              owner can see who joined and what files were attached
              without opening the popout meeting window. */}
          {initial?.id
            && currentUser?.name
            && normName(initial.booker || booker) === normName(currentUser.name)
            && <BookingAttendeesAndFiles booking={initial} isPast={isPast} />}
        </div>

        <div className="modal-foot">
          {isPast ? (
            // Meeting already ended — only summary stays editable.
            // Single "Close" button instead of save/delete/cancel.
            <>
              <div style={{ flex: 1, fontSize: '12.5px', color: 'var(--fg-3)' }}>
                ⏱ ประชุมผ่านไปแล้ว — แก้ไขรายละเอียดไม่ได้
              </div>
              <button className="btn-primary" onClick={onClose}>ปิด</button>
            </>
          ) : (
            <>
              {initial?.id && currentUser?.name && normName(initial.booker) === normName(currentUser.name) && (
                <button className="btn-ghost danger" onClick={() => onSave({ _delete: true, id: initial.id })}>
                  ลบการจอง
                </button>
              )}
              {(() => {
                // Only allow joining during the meeting window itself
                // (with a 10-min grace before start so people can prep).
                if (!initial?.id || !onJoinMeeting || !date) return null;
                const baseDate = new Date(date);
                const minNow = new Date().getHours() * 60 + new Date().getMinutes();
                const todayStr = (() => {
                  const d = new Date();
                  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                })();
                const bookingDateStr = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(baseDate.getDate()).padStart(2, '0')}`;
                const isToday = bookingDateStr === todayStr;
                const inWindow = isToday
                  && minNow >= (initial.start || 0) - 10  // 10-min pre-start grace
                  && minNow < (initial.end || 0);
                if (!inWindow) return null;
                return (
                  <button
                    className="btn-ghost"
                    style={{ background: 'oklch(0.95 0.06 200)', color: 'oklch(0.35 0.15 230)', fontWeight: 600 }}
                    onClick={() => onJoinMeeting(initial, room)}
                    title="เปิดหน้าต่างประชุม (เฉพาะระหว่างเวลาที่ประชุม)"
                  >
                    🎯 เข้าร่วมประชุม
                  </button>
                );
              })()}
              <div style={{ flex: 1 }} />
              <button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
              <button
                className="btn-primary"
                disabled={!canSave}
                onClick={() =>
                  onSave({
                    id: initial?.id,
                    title: title.trim(),
                    start,
                    end,
                    booker,
                    attendees,
                    purpose,
                    company,
                    customerCount,
                    equipment,
                    refreshments,
                  })
                }
              >
                {initial?.id ? 'บันทึกการเปลี่ยนแปลง' : 'ยืนยันการจอง'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
