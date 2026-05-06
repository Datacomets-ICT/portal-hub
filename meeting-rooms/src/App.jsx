import { useState, useEffect, useMemo } from 'react';
import LoginScreen from './LoginScreen.jsx';
import BookingsHistoryView from './BookingsHistoryView.jsx';
import BookingWizard from './BookingWizard.jsx';
import DashboardView from './DashboardView.jsx';
import RoomEditorView from './RoomEditorView.jsx';
import {
  RoomCard,
  BookingModal,
  DAY_START,
  DAY_END,
  THAI_DAYS,
  fmtDateLong,
  fmtTimeColon,
} from './components.jsx';
import { fetchRooms } from './api/rooms';
import { fetchEmployees } from './api/employees';
import {
  fetchBookingsByDateRange,
  insertBooking,
  updateBooking,
  deleteBooking,
} from './api/bookings';

const ADMIN_CODE = '11295';

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function App() {
  const TWEAKS = {
    density: 'comfort',
    accentHue: 45,
    showNowLine: true,
    showRoomId: true,
    groupBy: 'location',
  };
  const [tweaks, setTweaks] = useState(TWEAKS);
  const [tweaksOpen, setTweaksOpen] = useState(false);

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const raw = localStorage.getItem('mr_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const isAdmin = currentUser?.code === ADMIN_CODE;

  const handleLogin = (emp) => {
    localStorage.setItem('mr_user', JSON.stringify(emp));
    setCurrentUser(emp);
  };
  const handleLogout = () => {
    localStorage.removeItem('mr_user');
    setCurrentUser(null);
  };

  const [view, setView] = useState('schedule'); // schedule | mybookings | dashboard
  const [rooms, setRooms] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [mybookingsRefreshKey, setMybookingsRefreshKey] = useState(0);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', `oklch(0.68 0.17 ${tweaks.accentHue})`);
    document.documentElement.style.setProperty('--accent-ink', `oklch(0.42 0.17 ${tweaks.accentHue})`);
    document.documentElement.style.setProperty('--accent-soft', `oklch(0.95 0.04 ${tweaks.accentHue + 10})`);
  }, [tweaks.accentHue]);

  useEffect(() => {
    const onMsg = (ev) => {
      const d = ev.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === '__activate_edit_mode') setTweaksOpen(true);
      if (d.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const setTweak = (k, v) => {
    setTweaks((t) => {
      const next = { ...t, [k]: v };
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [k]: v } }, '*');
      return next;
    });
  };

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, -1 = prev, +1 = next
  const [dateIdx, setDateIdx] = useState(0);       // 0..6 within the visible week
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() + weekOffset * 7 + i);
        return d;
      }),
    [today, weekOffset]
  );
  const currentDate = weekDays[dateIdx];
  const currentDateStr = ymd(currentDate);

  // Day navigation — wraps to prev/next week when you hit the edge
  const goPrevDay = () => {
    if (dateIdx > 0) setDateIdx(dateIdx - 1);
    else {
      setWeekOffset((o) => o - 1);
      setDateIdx(6);
    }
  };
  const goNextDay = () => {
    if (dateIdx < 6) setDateIdx(dateIdx + 1);
    else {
      setWeekOffset((o) => o + 1);
      setDateIdx(0);
    }
  };
  const goToday = () => {
    setWeekOffset(0);
    setDateIdx(0);
  };
  const goPrevWeek = () => setWeekOffset((o) => o - 1);
  const goNextWeek = () => setWeekOffset((o) => o + 1);

  // Initial load: rooms + employees (once per session)
  useEffect(() => {
    if (!currentUser) return;
    if (rooms.length > 0) return;
    (async () => {
      try {
        const [r, e] = await Promise.all([fetchRooms(), fetchEmployees()]);
        setRooms(r);
        setEmployees(e);
      } catch (err) {
        console.error(err);
        setLoadError(err.message || String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUser]);

  // Refetch bookings whenever the visible week shifts
  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const weekStart = ymd(weekDays[0]);
        const weekEnd = ymd(weekDays[6]);
        const b = await fetchBookingsByDateRange(weekStart, weekEnd);
        setBookings(b);
      } catch (err) {
        console.error(err);
      }
    })();
  }, [currentUser, weekOffset]);

  const [query, setQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('all');
  const [floorFilter, setFloorFilter] = useState('all');
  const [minSeats, setMinSeats] = useState(0);
  const [showOnly, setShowOnly] = useState('all');

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  const currentMin = now.getHours() * 60 + now.getMinutes();
  const isToday = dateIdx === 0;

  const [modal, setModal] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const openCreate = (room, start, end) =>
    setModal({ room, initial: { start, end, booker: currentUser?.name || '' } });
  const openEdit = (b, room) => {
    if (!isAdmin && b.booker !== currentUser?.name) {
      toast(`ไม่มีสิทธิ์แก้ไขการจองของ ${b.booker}`);
      return;
    }
    setModal({ room, initial: b });
  };
  const closeModal = () => setModal(null);

  const [toasts, setToasts] = useState([]);
  const toast = (msg) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((ts) => [...ts, { id, msg }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 2800);
  };

  const saveBooking = async (data) => {
    try {
      if (data._delete) {
        await deleteBooking(data.id);
        setBookings((bs) => bs.filter((b) => b.id !== data.id));
        toast('ลบการจองแล้ว');
      } else if (data.id) {
        const existing = bookings.find((b) => b.id === data.id);
        const updated = await updateBooking(data.id, {
          ...existing,
          ...data,
          roomId: existing.roomId,
          bookingDate: existing.bookingDate,
        });
        setBookings((bs) => bs.map((b) => (b.id === data.id ? updated : b)));
        toast('อัปเดตการจองเรียบร้อย');
      } else {
        const inserted = await insertBooking({
          ...data,
          roomId: modal.room.id,
          bookingDate: currentDateStr,
        });
        setBookings((bs) => [...bs, inserted]);
        toast(`จอง "${data.title}" ในห้อง ${modal.room.name} แล้ว`);
      }
      setMybookingsRefreshKey((k) => k + 1);
      closeModal();
    } catch (err) {
      console.error(err);
      toast('เกิดข้อผิดพลาด: ' + (err.message || String(err)));
    }
  };

  const filteredRooms = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rooms.filter((r) => {
      // Only show rooms that are currently open for booking
      if (r.status !== 'available') return false;
      if (q && !(r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))) return false;
      if (locationFilter !== 'all' && r.location !== locationFilter) return false;
      if (floorFilter !== 'all' && r.floor !== floorFilter) return false;
      if (minSeats && (r.seats || 0) < minSeats) return false;
      if (showOnly === 'available-now' && isToday) {
        const bks = bookings.filter(
          (b) => b.roomId === r.id && b.bookingDate === currentDateStr
        );
        const busyNow = bks.some((b) => currentMin >= b.start && currentMin < b.end);
        if (busyNow) return false;
      }
      return true;
    });
  }, [rooms, query, locationFilter, floorFilter, minSeats, showOnly, bookings, currentDateStr, isToday, currentMin]);

  const grouped = useMemo(() => {
    const groups = {};
    for (const r of filteredRooms) {
      const key = tweaks.groupBy === 'floor' ? r.floor : r.location;
      groups[key] = groups[key] || [];
      groups[key].push(r);
    }
    return groups;
  }, [filteredRooms, tweaks.groupBy]);

  const countsByLocation = useMemo(() => {
    const m = {};
    for (const r of rooms) {
      if (r.status !== 'available') continue;
      m[r.location] = (m[r.location] || 0) + 1;
    }
    return m;
  }, [rooms]);

  const countsByFloor = useMemo(() => {
    const m = {};
    for (const r of rooms) {
      if (r.status !== 'available') continue;
      if (!r.floor) continue;
      m[r.floor] = (m[r.floor] || 0) + 1;
    }
    return m;
  }, [rooms]);

  const totalAvailable = useMemo(
    () => rooms.filter((r) => r.status === 'available').length,
    [rooms]
  );

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }
  if (loading) {
    return <div className="app-gate"><div className="app-gate-msg">กำลังโหลดข้อมูล…</div></div>;
  }
  if (loadError) {
    return (
      <div className="app-gate">
        <div className="app-gate-msg err">
          <div><b>โหลดข้อมูลไม่สำเร็จ</b></div>
          <div style={{ marginTop: 6, fontSize: 13 }}>{loadError}</div>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--fg-3)' }}>
            ตรวจสอบว่า:<br />
            1. ตั้งค่า <code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code> ใน <code>.env.local</code><br />
            2. รัน <code>supabase/schema.sql</code> และ <code>supabase/seed.sql</code> ใน Supabase SQL Editor แล้ว
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <a href="/" className="hub-back-btn" title="กลับหน้า Hub">
          <span aria-hidden="true">←</span>
          <span className="hub-back-label">Hub</span>
        </a>
        <div className="brand">
          <div className="brand-mark" />
          <span>Meeting Rooms</span>
        </div>
        <div className="topbar-sep" />
        <nav className="topbar-nav">
          <button
            className={view === 'schedule' ? 'on' : ''}
            onClick={() => setView('schedule')}
          >
            ตารางห้อง
          </button>
          <button
            className={view === 'history' ? 'on' : ''}
            onClick={() => setView('history')}
          >
            ประวัติการจอง
          </button>
          {isAdmin && (
            <button
              className={view === 'dashboard' ? 'on' : ''}
              onClick={() => setView('dashboard')}
            >
              Dashboard ห้องประชุม
            </button>
          )}
          {isAdmin && (
            <button
              className={view === 'editor' ? 'on' : ''}
              onClick={() => setView('editor')}
            >
              แก้ไขห้องประชุม
            </button>
          )}
        </nav>
        <div className="topbar-grow" />
        <button
          className="topbar-book-btn"
          onClick={() => setWizardOpen(true)}
        >
          + จองห้องประชุม
        </button>
        <div className="topbar-user">
          <div className="topbar-user-avatar">
            {(currentUser.nickname || currentUser.name || '?')[0]}
          </div>
          <div className="topbar-user-text">
            <div className="topbar-user-name">
              {currentUser.name}
              {currentUser.nickname && (
                <span className="topbar-user-nick"> ({currentUser.nickname})</span>
              )}
            </div>
            <div className="topbar-user-meta">
              <span className={`role-badge ${isAdmin ? 'admin' : ''}`}>
                {isAdmin ? 'Admin' : 'User'}
              </span>
              {currentUser.dept && <> · {currentUser.dept}</>}
              {currentUser.position && <> · {currentUser.position}</>}
            </div>
          </div>
        </div>
      </header>

      {view === 'schedule' && (
      <>
      <div className="subbar">
        <div className="date-title">
          <div className="date-title-h">{fmtDateLong(currentDate)}</div>
          <div className="date-title-s mono">
            ช่วง {fmtTimeColon(DAY_START)}–{fmtTimeColon(DAY_END)} · {filteredRooms.length} ห้องแสดงผล
          </div>
        </div>

        <div className="date-nav">
          <button onClick={goPrevWeek} title="สัปดาห์ก่อน">«</button>
          <button onClick={goPrevDay} title="วันก่อน">‹</button>
          <button className="today-btn" onClick={goToday}>วันนี้</button>
          <button onClick={goNextDay} title="วันถัดไป">›</button>
          <button onClick={goNextWeek} title="สัปดาห์ถัดไป">»</button>
        </div>

        <div className="day-strip">
          {weekDays.map((d, i) => (
            <button key={i} className={i === dateIdx ? 'on' : ''} onClick={() => setDateIdx(i)}>
              <span>{THAI_DAYS[d.getDay()]}</span>
              <span className="day-num">{d.getDate()}</span>
            </button>
          ))}
        </div>

        <div className="subbar-grow" />

        <div className="search">
          <span>🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาห้อง เช่น JUPITER, C003"
          />
        </div>

        <div className="density-toggle">
          {['compact', 'cozy', 'comfort'].map((d) => (
            <button key={d} className={tweaks.density === d ? 'on' : ''} onClick={() => setTweak('density', d)}>
              {d === 'compact' ? '≡' : d === 'cozy' ? '☰' : '▤'}
            </button>
          ))}
        </div>
      </div>

      <div className="main">
        <aside className="sidebar">
          <div className="side-h">สถานที่</div>
          <button
            className={`side-item ${locationFilter === 'all' ? 'on' : ''}`}
            onClick={() => setLocationFilter('all')}
          >
            <span className="swatch" />ทั้งหมด<span className="count">{totalAvailable}</span>
          </button>
          {Object.keys(countsByLocation).map((loc) => (
            <button
              key={loc}
              className={`side-item ${locationFilter === loc ? 'on' : ''}`}
              onClick={() => setLocationFilter(loc)}
            >
              <span className="swatch" />{loc}<span className="count">{countsByLocation[loc]}</span>
            </button>
          ))}

          <div className="side-h">ชั้น</div>
          <button
            className={`side-item ${floorFilter === 'all' ? 'on' : ''}`}
            onClick={() => setFloorFilter('all')}
          >
            <span className="swatch" />ทุกชั้น<span className="count">{totalAvailable}</span>
          </button>
          {Object.keys(countsByFloor)
            .sort()
            .map((fl) => (
              <button
                key={fl}
                className={`side-item ${floorFilter === fl ? 'on' : ''}`}
                onClick={() => setFloorFilter(fl)}
              >
                <span className="swatch" />{fl}<span className="count">{countsByFloor[fl]}</span>
              </button>
            ))}

          <div className="side-h">ความจุขั้นต่ำ</div>
          {[
            { v: 0, l: 'ไม่จำกัด' },
            { v: 4, l: '4+ ที่นั่ง' },
            { v: 8, l: '8+ ที่นั่ง' },
            { v: 12, l: '12+ ที่นั่ง' },
            { v: 20, l: '20+ ที่นั่ง' },
          ].map((opt) => (
            <button
              key={opt.v}
              className={`side-item ${minSeats === opt.v ? 'on' : ''}`}
              onClick={() => setMinSeats(opt.v)}
            >
              <span className="swatch" />{opt.l}
            </button>
          ))}

          <div className="side-h">สถานะ</div>
          {[
            { v: 'all', l: 'ดูทุกห้อง' },
            { v: 'available-now', l: 'ว่างตอนนี้' },
          ].map((opt) => (
            <button
              key={opt.v}
              className={`side-item ${showOnly === opt.v ? 'on' : ''}`}
              onClick={() => setShowOnly(opt.v)}
            >
              <span className="swatch" />{opt.l}
            </button>
          ))}

          <div className="side-h">จัดกลุ่มตาม</div>
          {[
            { v: 'location', l: 'สถานที่' },
            { v: 'floor', l: 'ชั้น' },
          ].map((opt) => (
            <button
              key={opt.v}
              className={`side-item ${tweaks.groupBy === opt.v ? 'on' : ''}`}
              onClick={() => setTweak('groupBy', opt.v)}
            >
              <span className="swatch" />{opt.l}
            </button>
          ))}
        </aside>

        <main className="content">
          {filteredRooms.length === 0 && (
            <div className="empty">ไม่พบห้องที่ตรงกับเงื่อนไข — ลองปรับตัวกรองด้านซ้าย</div>
          )}

          {Object.entries(grouped).map(([groupName, groupRooms]) => (
            <section key={groupName} className="section">
              <div className="section-head">
                <h2>{groupName}</h2>
                <span className="count">{groupRooms.length} ห้อง</span>
                <div className="legend">
                  <span>
                    <span className="sw" style={{ background: 'var(--accent)' }} />
                    จองแล้ว
                  </span>
                  <span>
                    <span className="sw" style={{ background: 'var(--bg-2)', border: '1px solid var(--line)' }} />
                    คลิกช่วงเวลาว่างในหลอดเวลาเพื่อจอง
                  </span>
                </div>
              </div>

              <div className="room-grid">
                {groupRooms.map((room) => {
                  const roomBookings = bookings.filter(
                    (b) => b.roomId === room.id && b.bookingDate === currentDateStr
                  );
                  return (
                    <RoomCard
                      key={room.id}
                      room={room}
                      bookings={roomBookings}
                      onSlotClick={openCreate}
                      onEventClick={openEdit}
                      currentMin={currentMin}
                      isToday={isToday && tweaks.showNowLine}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </main>
      </div>
      </>
      )}

      {view === 'history' && (
        <div className="view-wrap">
          <BookingsHistoryView
            currentUser={currentUser}
            rooms={rooms}
            employees={employees}
            onEditBooking={openEdit}
            refreshKey={mybookingsRefreshKey}
          />
        </div>
      )}

      {view === 'dashboard' && isAdmin && (
        <div className="view-wrap">
          <DashboardView rooms={rooms} employees={employees} />
        </div>
      )}

      {view === 'editor' && isAdmin && (
        <div className="view-wrap">
          <RoomEditorView
            rooms={rooms}
            onRoomUpdated={(saved) => {
              setRooms((rs) => {
                const idx = rs.findIndex((r) => r.id === saved.id);
                if (idx === -1) return [...rs, saved];
                return rs.map((r) => (r.id === saved.id ? saved : r));
              });
              toast(`บันทึกห้อง ${saved.name} แล้ว`);
            }}
            onRoomDeleted={(deletedId) => {
              const deletedName = rooms.find((r) => r.id === deletedId)?.name || deletedId;
              setRooms((rs) => rs.filter((r) => r.id !== deletedId));
              toast(`ลบห้อง ${deletedName} แล้ว`);
            }}
          />
        </div>
      )}

      <BookingWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        rooms={rooms}
        employees={employees}
        currentUser={currentUser}
        toast={toast}
        onSaved={(inserted) => {
          // If the booking falls in the currently-visible week, merge it in
          const weekStart = ymd(weekDays[0]);
          const weekEnd = ymd(weekDays[6]);
          if (inserted.bookingDate >= weekStart && inserted.bookingDate <= weekEnd) {
            setBookings((bs) => [...bs, inserted]);
          }
          setMybookingsRefreshKey((k) => k + 1);
        }}
      />

      <BookingModal
        open={!!modal}
        onClose={closeModal}
        onSave={saveBooking}
        room={modal?.room}
        date={currentDate}
        initial={modal?.initial}
        employees={employees}
        roomBookings={
          modal
            ? bookings.filter(
                (b) =>
                  b.roomId === modal.room.id &&
                  b.bookingDate === currentDateStr &&
                  b.id !== modal.initial?.id
              )
            : []
        }
      />

      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className="toast"><span className="tick">✓</span>{t.msg}</div>
        ))}
      </div>

      {tweaksOpen && (
        <div className="tweaks">
          <h3>Tweaks</h3>
          <div className="tweak-row">
            <label>Density</label>
            <select value={tweaks.density} onChange={(e) => setTweak('density', e.target.value)}>
              <option value="compact">Compact</option>
              <option value="cozy">Cozy</option>
              <option value="comfort">Comfort</option>
            </select>
          </div>
          <div className="tweak-row">
            <label>Accent hue</label>
            <input
              type="range"
              min="0"
              max="360"
              value={tweaks.accentHue}
              onChange={(e) => setTweak('accentHue', +e.target.value)}
            />
          </div>
          <div className="tweak-row">
            <label>Now line</label>
            <input
              type="checkbox"
              checked={tweaks.showNowLine}
              onChange={(e) => setTweak('showNowLine', e.target.checked)}
            />
          </div>
          <div className="tweak-row">
            <label>Group by</label>
            <select value={tweaks.groupBy} onChange={(e) => setTweak('groupBy', e.target.value)}>
              <option value="location">Location</option>
              <option value="floor">Floor</option>
            </select>
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 8, lineHeight: 1.4 }}>
            คลิกช่องว่างบน timeline เพื่อสร้างการจอง · คลิก event เพื่อแก้ไข/ลบ
          </div>
        </div>
      )}
    </div>
  );
}
