import { useState, useEffect, useMemo } from 'react';
import {
  fetchBookingsByBooker,
  fetchBookingsByDateRange,
} from './api/bookings';
import { fmtTimeColon } from './components.jsx';

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const THAI_MONTHS_LONG = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const THAI_DAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const WEEKDAY_HEADER = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.']; // Monday-first

function parseYMD(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function todayYMD() {
  const d = new Date();
  return ymd(d);
}
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function BookingsHistoryView({ rooms, employees, currentUser, onEditBooking, refreshKey }) {
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'list'

  return (
    <div className="mybookings">
      <div className="mybookings-head">
        <div>
          <h1 className="view-title">ประวัติการจอง</h1>
          <div className="view-subtitle">
            {viewMode === 'calendar'
              ? 'ปฏิทินรวมของทุกคน — คลิกของคุณเพื่อแก้ไข, ของคนอื่นดูได้แต่กดไม่ได้'
              : 'เฉพาะการจองของคุณ · 300 รายการล่าสุด'}
          </div>
        </div>

        <div className="view-toggle">
          <button
            className={viewMode === 'calendar' ? 'on' : ''}
            onClick={() => setViewMode('calendar')}
          >
            📅 ปฏิทิน
          </button>
          <button
            className={viewMode === 'list' ? 'on' : ''}
            onClick={() => setViewMode('list')}
          >
            ☰ รายการ
          </button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <CalendarView
          rooms={rooms}
          employees={employees}
          currentUser={currentUser}
          onEditBooking={onEditBooking}
          refreshKey={refreshKey}
        />
      ) : (
        <ListView
          rooms={rooms}
          employees={employees}
          currentUser={currentUser}
          onEditBooking={onEditBooking}
          refreshKey={refreshKey}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// LIST MODE
// ───────────────────────────────────────────────────────────
function ListView({ rooms, employees, currentUser, onEditBooking, refreshKey }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!currentUser?.name) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchBookingsByBooker(currentUser.name, 300)
      .then((data) => {
        if (!cancelled) setBookings(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, currentUser?.name]);

  const today = todayYMD();
  const roomMap = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r])), [rooms]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookings.filter((b) => {
      if (filter === 'upcoming' && b.bookingDate < today) return false;
      if (filter === 'past' && b.bookingDate >= today) return false;
      if (q) {
        const room = roomMap[b.roomId];
        const hay = `${b.title || ''} ${b.purpose || ''} ${b.company || ''} ${room?.name || ''} ${room?.location || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [bookings, filter, query, today, roomMap]);

  const counts = useMemo(() => {
    let up = 0, past = 0;
    for (const b of bookings) {
      if (b.bookingDate >= today) up++;
      else past++;
    }
    return { upcoming: up, past, all: bookings.length };
  }, [bookings, today]);

  return (
    <>
      <div className="mybookings-search" style={{ maxWidth: 400, marginBottom: 14 }}>
        <span>🔍</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาหัวข้อ / ห้อง / วัตถุประสงค์"
        />
      </div>

      <div className="filter-tabs">
        {[
          { v: 'all', l: 'ทั้งหมด', c: counts.all },
          { v: 'upcoming', l: 'กำลังจะมาถึง', c: counts.upcoming },
          { v: 'past', l: 'ที่ผ่านมา', c: counts.past },
        ].map((o) => (
          <button
            key={o.v}
            className={filter === o.v ? 'on' : ''}
            onClick={() => setFilter(o.v)}
          >
            {o.l} <span className="filter-count">{o.c}</span>
          </button>
        ))}
      </div>

      {loading && <div className="view-empty">กำลังโหลด…</div>}
      {error && <div className="view-error">โหลดข้อมูลไม่สำเร็จ: {error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <div className="view-empty">
          {query ? 'ไม่พบรายการที่ค้นหา' : 'ไม่มีประวัติการจอง'}
        </div>
      )}

      <div className="booking-cards">
        {filtered.map((b) => (
          <HistoryRow
            key={b.id}
            booking={b}
            room={roomMap[b.roomId]}
            isPast={b.bookingDate < today}
            onClick={() => onEditBooking(b, roomMap[b.roomId])}
          />
        ))}
      </div>
    </>
  );
}

function HistoryRow({ booking: b, room, isPast, onClick }) {
  const date = parseYMD(b.bookingDate);
  return (
    <button className={`booking-card ${isPast ? 'past' : 'up'}`} onClick={onClick}>
      <div className="bc-date">
        <div className="bc-day">{date.getDate()}</div>
        <div className="bc-mon">{THAI_MONTHS_SHORT[date.getMonth()]}</div>
        <div className="bc-wd">{THAI_DAYS_SHORT[date.getDay()]}</div>
      </div>
      <div className="bc-divider" />
      <div className="bc-main">
        <div className="bc-title">{b.title}</div>
        <div className="bc-room">
          {room?.name || b.roomId}
          <span className="bc-room-meta">
            {' '}· {room?.location || '—'} · {room?.floor || '—'}
          </span>
        </div>
        <div className="bc-chips">
          <span className="bc-chip mono">⏱ {fmtTimeColon(b.start)}–{fmtTimeColon(b.end)}</span>
          {b.attendees > 0 && <span className="bc-chip">👥 {b.attendees} คน</span>}
          {b.purpose && <span className="bc-chip">🎯 {b.purpose}</span>}
          {b.customerCount > 0 && (
            <span className="bc-chip">👤 ลูกค้า {b.customerCount} คน</span>
          )}
          {b.company && <span className="bc-chip">🏢 {b.company}</span>}
        </div>
      </div>
      <div className="bc-status">
        <span className={isPast ? 'bc-status-past' : 'bc-status-up'}>
          {isPast ? 'ผ่านไปแล้ว' : 'จะมาถึง'}
        </span>
      </div>
    </button>
  );
}

// ───────────────────────────────────────────────────────────
// CALENDAR MODE
// ───────────────────────────────────────────────────────────
function CalendarView({ rooms, employees, currentUser, onEditBooking, refreshKey }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null); // 'YYYY-MM-DD' or null

  const roomMap = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r])), [rooms]);
  // Bookings from the legacy CSV often have multiple spaces between first/last
  // name ("นีรชา   สุนธวงษ์"), while the employees table stores a single space.
  // Normalize whitespace so the lookup hits.
  const empByName = useMemo(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    return Object.fromEntries(employees.map((e) => [norm(e.name), e]));
  }, [employees]);

  useEffect(() => {
    let cancelled = false;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    setLoading(true);
    setError(null);
    fetchBookingsByDateRange(ymd(firstDay), ymd(lastDay))
      .then((data) => {
        if (cancelled) return;
        // Show ALL bookings — others' are read-only, only own can be edited.
        // The drawer disables click on rows where booker !== currentUser.name.
        setBookings(data || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year, month, refreshKey, currentUser?.name]);

  // Group bookings by date
  const byDate = useMemo(() => {
    const m = {};
    for (const b of bookings) {
      (m[b.bookingDate] = m[b.bookingDate] || []).push(b);
    }
    // Sort each day by start time
    for (const d in m) m[d].sort((a, b) => a.start - b.start);
    return m;
  }, [bookings]);

  // Build calendar cells (Monday-first)
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = firstOfMonth.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Monday-first offset: Sun(0)→6, Mon(1)→0, Tue(2)→1, ..., Sat(6)→5
  const startOffset = (firstDow + 6) % 7;
  const cellCount = Math.ceil((startOffset + daysInMonth) / 7) * 7; // 35 or 42

  const cells = [];
  for (let i = 0; i < cellCount; i++) {
    const dayNum = i - startOffset + 1;
    const cellDate = new Date(year, month, dayNum);
    const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
    const dow = cellDate.getDay();
    const key = ymd(cellDate);
    cells.push({
      key,
      dayNum: cellDate.getDate(),
      inMonth,
      isToday: key === ymd(today),
      isWeekend: dow === 0 || dow === 6,
      bookings: byDate[key] || [],
    });
  }

  const goPrev = () => {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else setMonth((m) => m - 1);
  };
  const goNext = () => {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else setMonth((m) => m + 1);
  };
  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  };

  const selectedDayBookings = selectedDay ? byDate[selectedDay] || [] : [];
  const selectedDayDate = selectedDay ? parseYMD(selectedDay) : null;

  return (
    <>
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button onClick={goPrev} aria-label="เดือนก่อน">‹</button>
          <button className="cal-today" onClick={goToday}>วันนี้</button>
          <button onClick={goNext} aria-label="เดือนถัดไป">›</button>
        </div>
        <div className="cal-title">
          {THAI_MONTHS_LONG[month]} {year + 543}
        </div>
        <div className="cal-stat">
          {loading ? 'กำลังโหลด…' : `${bookings.length.toLocaleString()} booking ในเดือนนี้`}
        </div>
      </div>

      {error && <div className="view-error">{error}</div>}

      <div className="cal-grid">
        <div className="cal-head">
          {WEEKDAY_HEADER.map((d, i) => (
            <div key={i} className={`cal-head-cell ${i >= 5 ? 'weekend' : ''}`}>
              {d}
            </div>
          ))}
        </div>
        <div className="cal-body">
          {cells.map((c) => (
            <button
              key={c.key}
              type="button"
              className={
                `cal-cell` +
                (c.inMonth ? '' : ' out') +
                (c.isToday ? ' today' : '') +
                (c.isWeekend ? ' weekend' : '') +
                (c.bookings.length > 0 ? ' has-events' : '')
              }
              onClick={() => c.inMonth && setSelectedDay(c.key)}
              disabled={!c.inMonth}
            >
              <div className="cal-cell-head">
                <span className="cal-daynum">{c.dayNum}</span>
                {c.bookings.length > 0 && (
                  <span className="cal-count">{c.bookings.length}</span>
                )}
              </div>
              <div className="cal-events">
                {c.bookings.slice(0, 4).map((b) => {
                  const normBooker = (b.booker || '').replace(/\s+/g, ' ').trim();
                  const normUser = (currentUser?.name || '').replace(/\s+/g, ' ').trim();
                  const isMine = !!normUser && normBooker === normUser;
                  const label = isMine ? b.title : (normBooker || 'มีการจอง');
                  const tip = isMine
                    ? `${fmtTimeColon(b.start)} · ${b.title}`
                    : `${fmtTimeColon(b.start)} · จองโดย ${normBooker || '—'}`;
                  return (
                    <div key={b.id} className={`cal-event${isMine ? ' is-mine' : ''}`} title={tip}>
                      <span className="cal-event-dot" />
                      <span className="cal-event-time mono">
                        {fmtTimeColon(b.start)}
                      </span>
                      <span className="cal-event-title">{label}</span>
                    </div>
                  );
                })}
                {c.bookings.length > 4 && (
                  <div className="cal-more">+ อีก {c.bookings.length - 4}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedDay && (
        <DayDrawer
          day={selectedDayDate}
          bookings={selectedDayBookings}
          roomMap={roomMap}
          empByName={empByName}
          currentUser={currentUser}
          onClose={() => setSelectedDay(null)}
          onEditBooking={(b) => {
            onEditBooking(b, roomMap[b.roomId]);
            setSelectedDay(null);
          }}
        />
      )}
    </>
  );
}

function DayDrawer({ day, bookings, roomMap, empByName, currentUser, onClose, onEditBooking }) {
  const dateLabel = `วัน${['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'][day.getDay()]}ที่ ${day.getDate()} ${THAI_MONTHS_LONG[day.getMonth()]} ${day.getFullYear() + 543}`;
  return (
    <div className="cal-drawer-backdrop" onClick={onClose}>
      <aside className="cal-drawer" onClick={(e) => e.stopPropagation()}>
        <header className="cal-drawer-head">
          <div>
            <h2>{dateLabel}</h2>
            <div className="cal-drawer-sub">{bookings.length} การจอง</div>
          </div>
          <button className="cal-drawer-close" onClick={onClose} aria-label="ปิด">✕</button>
        </header>

        {bookings.length === 0 ? (
          <div className="view-empty" style={{ margin: 16 }}>ไม่มีการจองในวันนี้</div>
        ) : (
          <div className="cal-drawer-list">
            {bookings.map((b) => {
              const room = roomMap[b.roomId];
              const normBooker = (b.booker || '').replace(/\s+/g, ' ').trim();
              const emp = empByName[normBooker];
              const isMine = normBooker === (currentUser?.name || '').replace(/\s+/g, ' ').trim();
              const bookerLabel = emp
                ? `${emp.name}${emp.nickname ? ` (${emp.nickname})` : ''}${emp.position ? ` · ${emp.position}` : ''}`
                : (normBooker || '—');
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
                    <div className="cdi-room">
                      {room?.name || b.roomId} <span className="cdi-room-meta">· {room?.location} · {room?.floor}</span>
                    </div>
                    <div className="cdi-chips">
                      <span className="cdi-chip">👤 {bookerLabel}</span>
                      {isMine && b.purpose && <span className="cdi-chip">🎯 {b.purpose}</span>}
                      {isMine && b.customerCount > 0 && (
                        <span className="cdi-chip">👤 ลูกค้า {b.customerCount}</span>
                      )}
                      {b.attendees > 0 && (
                        <span className="cdi-chip">👥 {b.attendees}</span>
                      )}
                    </div>
                  </div>
                </>
              );
              return isMine ? (
                <button
                  key={b.id}
                  className="cal-drawer-item"
                  onClick={() => onEditBooking(b)}
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
