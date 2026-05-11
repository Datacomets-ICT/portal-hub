import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  DAY_START,
  DAY_END,
  fmtTimeColon,
  fmtDateLong,
} from './components.jsx';
import { fetchBookingsByDateRange, insertBooking } from './api/bookings';

const PURPOSES = [
  'ประชุมภายใน',
  'รับรองลูกค้า',
  'สัมภาษณ์งาน',
  'Workshop',
  'อัดคลิป',
  'อบรม',
];
const EQUIPMENT_OPTIONS = ['Projector', 'TV/จอ', 'Video Conf', 'Whiteboard', 'Mic', 'ปลั๊กไฟ'];
const REFRESHMENT_OPTIONS = ['อาหารว่าง', 'เครื่องดื่ม', 'ขนม', 'ผลไม้', 'อาหารกลางวัน', 'ของที่ระลึก'];

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseYMD(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function BookingWizard({
  open,
  onClose,
  rooms = [],
  currentUser,
  onSaved,
  toast,
}) {
  // Criteria
  const [purpose, setPurpose] = useState('ประชุมภายใน');
  const [bookingDate, setBookingDate] = useState(() => ymd(new Date()));
  const [start, setStart] = useState(9 * 60);
  const [end, setEnd] = useState(10 * 60);
  const [attendees, setAttendees] = useState(4);
  const [customerCount, setCustomerCount] = useState(0);
  const [locationFilter, setLocationFilter] = useState('all');

  // Selection + final details
  const [selectedRoom, setSelectedRoom] = useState(null);
  // Magnifier preview pane — separate from selection so the user can
  // peek at a room without committing to it.
  const [previewRoom, setPreviewRoom] = useState(null);
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [equipment, setEquipment] = useState([]);
  const [refreshments, setRefreshments] = useState([]);

  const [bookingsOnDate, setBookingsOnDate] = useState([]);
  const [saving, setSaving] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setPurpose('ประชุมภายใน');
      setBookingDate(ymd(new Date()));
      setStart(9 * 60);
      setEnd(10 * 60);
      setAttendees(4);
      setCustomerCount(0);
      setLocationFilter('all');
      setSelectedRoom(null);
      setTitle('');
      setCompany('');
      setEquipment([]);
      setRefreshments([]);
    }
  }, [open]);

  // Fetch bookings when date changes
  useEffect(() => {
    if (!open || !bookingDate) return;
    let cancelled = false;
    fetchBookingsByDateRange(bookingDate, bookingDate)
      .then((data) => {
        if (!cancelled) setBookingsOnDate(data);
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [open, bookingDate]);

  const totalPeople = (attendees || 0) + (customerCount || 0);

  const availableLocations = useMemo(() => {
    const set = new Set();
    for (const r of rooms) {
      if (r.status !== 'available') continue;
      if (r.location) set.add(r.location);
    }
    return Array.from(set);
  }, [rooms]);

  const suggestedRooms = useMemo(() => {
    return rooms
      .filter((r) => r.status === 'available')
      .filter((r) => locationFilter === 'all' || r.location === locationFilter)
      .filter((r) => (r.seats || 0) >= totalPeople)
      // If room defines allowed purposes and the chosen purpose isn't in it, skip.
      // Empty / missing purposes array = room accepts all purposes (default).
      .filter((r) => !r.purposes || r.purposes.length === 0 || r.purposes.includes(purpose))
      .map((r) => {
        const roomBks = bookingsOnDate.filter((b) => b.roomId === r.id);
        const conflict = roomBks.find((b) => !(b.end <= start || b.start >= end));
        return { ...r, _conflict: conflict || null };
      })
      .sort((a, b) => {
        if (!!a._conflict !== !!b._conflict) return a._conflict ? 1 : -1;
        return (a.seats || 0) - (b.seats || 0);
      });
  }, [rooms, bookingsOnDate, totalPeople, start, end, purpose, locationFilter]);

  // Clear selection if criteria change and it no longer fits / is now conflicting
  useEffect(() => {
    if (!selectedRoom) return;
    const fresh = suggestedRooms.find((r) => r.id === selectedRoom.id);
    if (!fresh || fresh._conflict) {
      setSelectedRoom(null);
    } else if (fresh !== selectedRoom) {
      setSelectedRoom(fresh);
    }
  }, [suggestedRooms, selectedRoom]);

  const availableCount = suggestedRooms.filter((r) => !r._conflict).length;

  const timeOptions = [];
  for (let m = DAY_START; m <= DAY_END; m += 15) timeOptions.push(m);

  const criteriaOk = end > start && totalPeople > 0 && !!bookingDate;
  const canConfirm = criteriaOk && !!selectedRoom && !selectedRoom._conflict && !!title.trim();

  const toggleEquip = (k) =>
    setEquipment((e) => (e.includes(k) ? e.filter((x) => x !== k) : [...e, k]));
  const toggleRefresh = (k) =>
    setRefreshments((r) => (r.includes(k) ? r.filter((x) => x !== k) : [...r, k]));

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSaving(true);
    try {
      const inserted = await insertBooking({
        roomId: selectedRoom.id,
        bookingDate,
        start,
        end,
        title: title.trim(),
        booker: currentUser?.name || '',
        attendees,
        customerCount,
        purpose,
        company,
        equipment,
        refreshments,
      });
      onSaved?.(inserted, selectedRoom);
      toast?.(`จอง "${title.trim()}" ในห้อง ${selectedRoom.name} แล้ว`);
      onClose();
    } catch (err) {
      console.error(err);
      toast?.('เกิดข้อผิดพลาด: ' + (err.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="wizard-modal" onClick={(e) => e.stopPropagation()}>
        <header className="wizard-head">
          <div>
            <div className="wizard-kicker">จองห้องประชุม</div>
            <h2 className="wizard-title">เลือกวัตถุประสงค์ · เวลา · ห้อง</h2>
          </div>
          <button className="wizard-close" onClick={onClose} aria-label="ปิด">
            ✕
          </button>
        </header>

        <div className="wizard-body">
          {/* Criteria */}
          <div className="wizard-section">
            <div className="wizard-section-h">ต้องการประชุมเรื่องอะไร?</div>
            <div className="purpose-grid">
              {PURPOSES.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`purpose-tile ${purpose === p ? 'on' : ''}`}
                  onClick={() => setPurpose(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Location filter — picked first so the When / Rooms sections scope to it */}
          <div className="wizard-section">
            <div className="wizard-section-h">สถานที่</div>
            <div className="purpose-grid">
              <button
                type="button"
                className={`purpose-tile ${locationFilter === 'all' ? 'on' : ''}`}
                onClick={() => setLocationFilter('all')}
              >
                ทั้งหมด
              </button>
              {availableLocations.map((loc) => (
                <button
                  key={loc}
                  type="button"
                  className={`purpose-tile ${locationFilter === loc ? 'on' : ''}`}
                  onClick={() => setLocationFilter(loc)}
                >
                  {loc}
                </button>
              ))}
            </div>
          </div>

          <div className="wizard-section">
            <div className="wizard-section-h">เมื่อไหร่?</div>
            <div className="field-row">
              <label className="field field-grow">
                <span className="field-label">วันที่</span>
                <input
                  type="date"
                  className="field-input"
                  value={bookingDate}
                  min={ymd(new Date())}
                  onChange={(e) => setBookingDate(e.target.value)}
                />
                {bookingDate && (
                  <span className="field-hint">{fmtDateLong(parseYMD(bookingDate))}</span>
                )}
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span className="field-label">เริ่ม</span>
                <select
                  className="field-input"
                  value={start}
                  onChange={(e) => setStart(+e.target.value)}
                >
                  {timeOptions.filter((t) => t < DAY_END).map((t) => (
                    <option key={t} value={t}>{fmtTimeColon(t)}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">สิ้นสุด</span>
                <select
                  className="field-input"
                  value={end}
                  onChange={(e) => setEnd(+e.target.value)}
                >
                  {timeOptions.filter((t) => t > start).map((t) => (
                    <option key={t} value={t}>{fmtTimeColon(t)}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">จำนวนคน</span>
                <input
                  type="number"
                  className="field-input"
                  min={1}
                  value={attendees}
                  onChange={(e) => setAttendees(+e.target.value)}
                />
              </label>
              {purpose === 'รับรองลูกค้า' && (
                <label className="field">
                  <span className="field-label">จำนวนลูกค้า</span>
                  <input
                    type="number"
                    className="field-input"
                    min={0}
                    value={customerCount}
                    onChange={(e) => setCustomerCount(+e.target.value)}
                  />
                </label>
              )}
            </div>
            <div className="wizard-summary">
              รวม {totalPeople} คน · {fmtTimeColon(start)}–{fmtTimeColon(end)} ·{' '}
              {((end - start) / 60).toFixed(1)} ชั่วโมง
            </div>
          </div>

          {/* Suggested rooms */}
          <div className="wizard-section">
            <div className="wizard-section-h">
              เลือกห้อง
              <span className="wizard-section-count">
                {availableCount > 0
                  ? `พบห้องว่าง ${availableCount} ห้อง`
                  : suggestedRooms.length > 0
                  ? 'ทุกห้องที่เหมาะติดจอง — ลองเปลี่ยนเวลา'
                  : 'ไม่มีห้องที่เหมาะ — ลดจำนวนคนหรือเปลี่ยนวัตถุประสงค์'}
              </span>
            </div>
            {suggestedRooms.length > 0 ? (
              <div className="room-suggest-grid">
                {suggestedRooms.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`room-suggest ${selectedRoom?.id === r.id ? 'on' : ''} ${r._conflict ? 'conflict' : ''}`}
                    onClick={() => !r._conflict && setSelectedRoom(r)}
                    disabled={!!r._conflict}
                  >
                    <div
                      className="rs-photo"
                      style={{ backgroundImage: `url(${r.picture})` }}
                    >
                      <span
                        className="rs-zoom-btn"
                        role="button"
                        tabIndex={0}
                        title="ดูรูปห้องแบบใหญ่"
                        aria-label={`ดูรูปห้อง ${r.name}`}
                        onClick={(e) => { e.stopPropagation(); setPreviewRoom(r); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation();
                            e.preventDefault();
                            setPreviewRoom(r);
                          }
                        }}
                      >
                        {/* magnifier glyph — inline SVG so we don't pull a font */}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <circle cx="11" cy="11" r="7" />
                          <line x1="20" y1="20" x2="16.65" y2="16.65" />
                        </svg>
                      </span>
                    </div>
                    <div className="rs-info">
                      <div className="rs-name">{r.name}</div>
                      <div className="rs-meta">
                        {r.location} · {r.floor} · {r.seats} ที่นั่ง
                      </div>
                      {r._conflict && (
                        <div className="rs-conflict">
                          ⚠ ติดจอง {fmtTimeColon(r._conflict.start)}–{fmtTimeColon(r._conflict.end)}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="wizard-empty">
                ไม่พบห้องที่ว่างตามเงื่อนไข
              </div>
            )}
          </div>

          {/* Final details — shows after room selected */}
          {selectedRoom && !selectedRoom._conflict && (
            <div className="wizard-section wizard-section-details">
              <div className="wizard-section-h">รายละเอียดการประชุม</div>
              <label className="field field-full">
                <span className="field-label">หัวข้อการประชุม</span>
                <input
                  className="field-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="เช่น Weekly Sync, Product Review"
                  autoFocus
                />
              </label>

              {currentUser && (
                <div className="booker-card" style={{ marginTop: 4 }}>
                  <div className="booker-avatar">
                    {(currentUser.nickname || currentUser.name || '?')[0]}
                  </div>
                  <div className="booker-info">
                    <div className="booker-name">
                      {currentUser.name}
                      {currentUser.nickname && (
                        <span className="booker-nick"> ({currentUser.nickname})</span>
                      )}
                    </div>
                    <div className="booker-meta">
                      ผู้จอง · รหัส {currentUser.code}
                      {currentUser.dept && <> · {currentUser.dept}</>}
                    </div>
                  </div>
                </div>
              )}

              {purpose === 'รับรองลูกค้า' && (
                <>
                  <label className="field field-full">
                    <span className="field-label">ชื่อบริษัท</span>
                    <input
                      className="field-input"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="บริษัทผู้มาเยี่ยม"
                    />
                  </label>
                  <div className="field field-full">
                    <span className="field-label">เตรียมของรับรอง</span>
                    <div className="chip-row">
                      {REFRESHMENT_OPTIONS.map((k) => (
                        <button
                          key={k}
                          type="button"
                          className={`chip ${refreshments.includes(k) ? 'chip-on' : ''}`}
                          onClick={() => toggleRefresh(k)}
                        >
                          {refreshments.includes(k) && <span className="chip-check">✓</span>}
                          {k}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="field field-full">
                <span className="field-label">อุปกรณ์เสริม</span>
                <div className="chip-row">
                  {EQUIPMENT_OPTIONS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`chip ${equipment.includes(k) ? 'chip-on' : ''}`}
                      onClick={() => toggleEquip(k)}
                    >
                      {equipment.includes(k) && <span className="chip-check">✓</span>}
                      {k}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="wizard-foot">
          <button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <div style={{ flex: 1 }} />
          <button
            className="btn-primary"
            disabled={!canConfirm || saving}
            onClick={handleConfirm}
          >
            {saving
              ? 'กำลังบันทึก…'
              : !selectedRoom
              ? 'เลือกห้องก่อน'
              : 'ยืนยันการจอง'}
          </button>
        </div>
      </div>

      {previewRoom && (
        <RoomPreviewPane
          room={previewRoom}
          onClose={() => setPreviewRoom(null)}
        />
      )}
    </div>
  );
}

// Floating preview pane that slides in from the right edge of the
// viewport. Renders via portal so it escapes the modal's stacking
// context and overlays the entire screen on small displays.
//
// The "slideshow" cycles through room.pictures (array) when present;
// for now most rooms only have a single room.picture, in which case
// the pane shows that one image with a slow ken-burns animation so
// it still feels alive. When the schema gains multi-image support,
// passing room.pictures = [url1, url2, ...] will Just Work — no UI
// change needed.
function RoomPreviewPane({ room, onClose }) {
  const images = useMemo(() => {
    if (Array.isArray(room.pictures) && room.pictures.length > 0) return room.pictures;
    if (room.picture) return [room.picture];
    return [];
  }, [room]);
  const [idx, setIdx] = useState(0);

  // Auto-advance — only meaningful when multiple images. Single image
  // gets the ken-burns effect via CSS, no JS rotation needed.
  useEffect(() => {
    if (images.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % images.length), 3500);
    return () => clearInterval(t);
  }, [images.length]);

  // Esc to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="room-preview-backdrop" onClick={onClose}>
      <aside
        className="room-preview-pane"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`รูปห้อง ${room.name}`}
      >
        <button
          type="button"
          className="room-preview-close"
          onClick={onClose}
          aria-label="ปิด"
        >
          ✕
        </button>

        <div className="room-preview-stage">
          {images.length === 0 ? (
            <div className="room-preview-empty">ห้องนี้ยังไม่มีรูป</div>
          ) : (
            images.map((src, i) => (
              <div
                key={src + i}
                className={`room-preview-img ${i === idx ? 'on' : ''} ${images.length === 1 ? 'kenburns' : ''}`}
                style={{ backgroundImage: `url(${src})` }}
              />
            ))
          )}
          {images.length > 1 && (
            <div className="room-preview-dots">
              {images.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`room-preview-dot ${i === idx ? 'on' : ''}`}
                  onClick={() => setIdx(i)}
                  aria-label={`ภาพที่ ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="room-preview-info">
          <div className="room-preview-name">{room.name}</div>
          <div className="room-preview-meta">
            {room.location} · {room.floor} · {room.seats} ที่นั่ง
          </div>
          {Array.isArray(room.equipment) && room.equipment.length > 0 && (
            <div className="room-preview-equip">
              {room.equipment.map((e) => (
                <span key={e} className="room-preview-equip-chip">{e}</span>
              ))}
            </div>
          )}
          {room.description && (
            <div className="room-preview-desc">{room.description}</div>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}
