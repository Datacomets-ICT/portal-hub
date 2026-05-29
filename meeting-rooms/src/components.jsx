import { useState, useEffect, useRef } from 'react';
import MeetingSummaryPanel from './MeetingSummaryPanel.jsx';

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
        const isMine = !!currentUser?.name && b.booker === currentUser.name;
        const label = isMine ? b.title : (b.booker || 'มีการจอง');
        const tooltip = isMine
          ? `${fmtTimeColon(b.start)}–${fmtTimeColon(b.end)} · ${b.title}`
          : `${fmtTimeColon(b.start)}–${fmtTimeColon(b.end)} · จองโดย ${b.booker || '—'}`;
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

export function RoomCard({ room, bookings, onSlotClick, onEventClick, currentMin, isToday, currentUser }) {
  const available = room.status === 'available';
  const occupiedNow =
    isToday && bookings.some((b) => currentMin >= b.start && currentMin < b.end);

  return (
    <article className="room-card">
      <header className="rc-head">
        <div className="rc-loc">{room.location}</div>
        <div className="rc-id-name">
          <span className="rc-id mono">{room.id}</span>
          <span className="rc-name-small">{room.name}</span>
        </div>
      </header>

      <div className="rc-photo" style={{ backgroundImage: `url(${room.picture})` }}>
        {occupiedNow && <div className="rc-occupied-badge">ใช้งานอยู่</div>}
      </div>

      <div className="rc-body">
        <div className="rc-title">{room.name}</div>
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

// Click an existing booking in the modal timeline → render this inline card
function BookingDetailsCard({ booking, employee, onClose, currentUser, room }) {
  return (
    <div className="mt-details">
      <div className="mt-details-head">
        <div className="mt-details-title">{booking.title}</div>
        <button
          type="button"
          className="mt-details-close"
          onClick={onClose}
          aria-label="ปิด"
        >
          ✕
        </button>
      </div>
      <div className="mt-details-time mono">
        {fmtTimeColon(booking.start)}–{fmtTimeColon(booking.end)}
        {booking.attendees ? ` · ${booking.attendees} คน` : ''}
      </div>

      {employee ? (
        <div className="mt-details-booker">
          <div className="booker-avatar">
            {(employee.nickname || employee.name || '?')[0]}
          </div>
          <div className="mt-details-info">
            <div className="mt-details-name">
              {employee.name}
              {employee.nickname && (
                <span className="mt-details-nick"> ({employee.nickname})</span>
              )}
            </div>
            <div className="mt-details-meta">
              รหัส {employee.code}
              {employee.dept && <> · {employee.dept}</>}
            </div>
            {employee.position && (
              <div className="mt-details-pos">{employee.position}</div>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-details-booker-fallback">
          ผู้จอง: <b>{booking.booker || '—'}</b>
          <div className="mt-details-hint">
            (ไม่พบในทะเบียนพนักงานปัจจุบัน — อาจเป็น booking เก่า)
          </div>
        </div>
      )}

      <MeetingSummaryPanel booking={booking} currentUser={currentUser} room={room} employee={employee} />
    </div>
  );
}

export function BookingModal({ open, onClose, onSave, room, date, initial, employees = [], roomBookings = [], currentUser = null }) {
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
              ⏱ <b>ประชุมผ่านไปแล้ว</b> — แก้ไขรายละเอียดไม่ได้ ใช้ได้แค่ "สรุปการประชุม" ด้านล่าง
            </div>
          )}
          <fieldset className="booking-form-fields" disabled={isPast}>
          <label className="field field-full">
            <span className="field-label">หัวข้อการประชุม{isPast && <em style={{fontWeight:400,fontSize:11,color:'#9aa7bd',marginLeft:6}}>(ล็อก — ประชุมผ่านไปแล้ว)</em>}</span>
            <input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น Weekly Sync, Product Review" autoFocus readOnly={isPast} style={isPast ? {background:'var(--surface-2)',cursor:'not-allowed'} : undefined} />
          </label>

          <div className="field-row">
            <label className="field">
              <span className="field-label">เริ่ม</span>
              <select className="field-input" value={start} onChange={(e) => setStart(+e.target.value)}>
                {timeOptions.filter((t) => t < DAY_END).map((t) => <option key={t} value={t}>{fmtTimeColon(t)}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">สิ้นสุด</span>
              <select className="field-input" value={end} onChange={(e) => setEnd(+e.target.value)}>
                {timeOptions.filter((t) => t > start).map((t) => <option key={t} value={t}>{fmtTimeColon(t)}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">จำนวนคน</span>
              <input type="number" className="field-input" min={1} max={room.seats} value={attendees} onChange={(e) => setAttendees(+e.target.value)} />
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
              <select className="field-input" value={purpose} onChange={(e) => setPurpose(e.target.value)} disabled={isPast} style={isPast ? {background:'var(--surface-2)',cursor:'not-allowed'} : undefined}>
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

          <div className="field field-full">
            <span className="field-label">อุปกรณ์เสริม</span>
            <div className="chip-row">
              {['Projector', 'TV/จอ', 'Video Conf', 'Whiteboard', 'Mic', 'ปลั๊กไฟ'].map((k) => (
                <button key={k} type="button" className={`chip ${equipment.includes(k) ? 'chip-on' : ''}`} onClick={() => toggleEquip(k)}>
                  {equipment.includes(k) && <span className="chip-check">✓</span>}{k}
                </button>
              ))}
            </div>
          </div>

          {hasConflict && (
            <div className="conflict-warn">
              ⚠ ช่วงเวลานี้ชนกับ <b>"{conflicts[0].title}"</b>{' '}
              ({fmtTimeColon(conflicts[0].start)}–{fmtTimeColon(conflicts[0].end)}) —
              โปรดเลือกเวลาใหม่
            </div>
          )}

          </fieldset>

          {/* Meeting summary panel — outside the disabled fieldset so it
              stays interactive even when the meeting has already ended.
              Only shown for existing bookings (has an id). */}
          {initial?.id && (
            <MeetingSummaryPanel
              booking={{ id: initial.id, bookingDate: initial.bookingDate, ...initial }}
              currentUser={currentUser}
              room={room}
              employee={findEmpByName(employees, initial?.booker || booker)}
            />
          )}
        </div>

        <div className="modal-foot">
          {isPast ? (
            // Meeting already ended — only summary stays editable.
            // Single "Close" button instead of save/delete/cancel.
            <>
              <div style={{ flex: 1, fontSize: '12.5px', color: 'var(--fg-3)' }}>
                ⏱ ประชุมผ่านไปแล้ว — แก้ไขรายละเอียดไม่ได้ ใช้ได้แค่สรุปการประชุม
              </div>
              <button className="btn-primary" onClick={onClose}>ปิด</button>
            </>
          ) : (
            <>
              {initial?.id && (
                <button className="btn-ghost danger" onClick={() => onSave({ _delete: true, id: initial.id })}>
                  ลบการจอง
                </button>
              )}
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
