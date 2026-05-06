import { useState, useMemo, useRef } from 'react';
import { updateRoom, insertRoom, deleteRoom } from './api/rooms';
import { supabase } from './lib/supabase';

const STORAGE_BUCKET = 'mtg-room-photos';

const PURPOSE_OPTIONS = [
  'ประชุมภายใน',
  'รับรองลูกค้า',
  'สัมภาษณ์งาน',
  'Workshop',
  'อัดคลิป',
  'อบรม',
];
const EQUIPMENT_OPTIONS = [
  'Projector',
  'TV/จอ',
  'Video Conf',
  'Whiteboard',
  'Mic',
  'ปลั๊กไฟ',
  'Speakerphone',
  'Flipchart',
  'เครื่องปรับอากาศ',
  'Wi-Fi',
];

export default function RoomEditorView({ rooms, onRoomUpdated, onRoomDeleted }) {
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [locationFilter, setLocationFilter] = useState('all');
  const [query, setQuery] = useState('');

  const locations = useMemo(() => {
    const set = new Set();
    for (const r of rooms) if (r.location) set.add(r.location);
    return Array.from(set);
  }, [rooms]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rooms
      .filter((r) => locationFilter === 'all' || r.location === locationFilter)
      .filter((r) => {
        if (!q) return true;
        const hay = `${r.id} ${r.name} ${r.location} ${r.floor}`.toLowerCase();
        return hay.includes(q);
      });
  }, [rooms, locationFilter, query]);

  // Group by location for a cleaner overview
  const grouped = useMemo(() => {
    const m = {};
    for (const r of filtered) {
      const k = r.location || 'อื่นๆ';
      (m[k] = m[k] || []).push(r);
    }
    return m;
  }, [filtered]);

  return (
    <div className="room-editor">
      <div className="mybookings-head">
        <div>
          <h1 className="view-title">แก้ไขห้องประชุม</h1>
          <div className="view-subtitle">
            จัดการรายละเอียด · อุปกรณ์ · วัตถุประสงค์ของแต่ละห้อง · {rooms.length} ห้องทั้งหมด
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="mybookings-search">
            <span>🔍</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาห้อง (ชื่อ, รหัส, ชั้น)"
            />
          </div>
          <button
            type="button"
            className="topbar-book-btn"
            onClick={() => setCreating(true)}
          >
            + เพิ่มห้อง
          </button>
        </div>
      </div>

      <div className="filter-tabs">
        <button
          className={locationFilter === 'all' ? 'on' : ''}
          onClick={() => setLocationFilter('all')}
        >
          ทุกสถานที่ <span className="filter-count">{rooms.length}</span>
        </button>
        {locations.map((loc) => (
          <button
            key={loc}
            className={locationFilter === loc ? 'on' : ''}
            onClick={() => setLocationFilter(loc)}
          >
            {loc}{' '}
            <span className="filter-count">
              {rooms.filter((r) => r.location === loc).length}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="view-empty">ไม่พบห้องที่ค้นหา</div>
      )}

      {Object.entries(grouped).map(([loc, group]) => (
        <section key={loc} className="editor-section">
          <div className="editor-section-head">
            <h2>{loc}</h2>
            <span className="editor-section-count">{group.length} ห้อง</span>
          </div>
          <div className="editor-grid">
            {group.map((r) => (
              <RoomEditCard key={r.id} room={r} onEdit={() => setEditing(r)} />
            ))}
          </div>
        </section>
      ))}

      {editing && (
        <RoomEditModal
          room={editing}
          mode="edit"
          existingIds={new Set(rooms.map((r) => r.id))}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            onRoomUpdated(updated);
            setEditing(null);
          }}
          onDeleted={(deletedId) => {
            onRoomDeleted?.(deletedId);
            setEditing(null);
          }}
        />
      )}

      {creating && (
        <RoomEditModal
          room={null}
          mode="create"
          existingIds={new Set(rooms.map((r) => r.id))}
          onClose={() => setCreating(false)}
          onSaved={(inserted) => {
            onRoomUpdated(inserted);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Read-only summary card — click "แก้ไข" to open modal
// ───────────────────────────────────────────────────────────
function RoomEditCard({ room, onEdit }) {
  const available = room.status === 'available';
  return (
    <article className={`editor-card ${available ? '' : 'off'}`}>
      <div
        className="editor-card-photo"
        style={{ backgroundImage: `url(${room.picture})` }}
      >
        <div className={`editor-card-status ${available ? 'ok' : 'bad'}`}>
          {available ? '● available' : '○ unavailable'}
        </div>
      </div>

      <div className="editor-card-body">
        <div className="editor-card-title-row">
          <div>
            <div className="editor-card-id mono">{room.id}</div>
            <div className="editor-card-name">{room.name}</div>
          </div>
          <button type="button" className="editor-card-edit" onClick={onEdit}>
            ✎ แก้ไข
          </button>
        </div>

        <div className="editor-card-meta">
          {room.floor || '—'} · {room.seats || 0} ที่นั่ง
        </div>

        <dl className="editor-card-list">
          <dt>อุปกรณ์</dt>
          <dd>
            {room.equipment && room.equipment.length > 0 ? (
              <span className="editor-chip-row">
                {room.equipment.map((e) => (
                  <span key={e} className="editor-chip">{e}</span>
                ))}
              </span>
            ) : (
              <span className="editor-empty">ยังไม่ได้ระบุ</span>
            )}
          </dd>

          <dt>วัตถุประสงค์</dt>
          <dd>
            {room.purposes && room.purposes.length > 0 ? (
              <span className="editor-chip-row">
                {room.purposes.map((p) => (
                  <span key={p} className="editor-chip accent">{p}</span>
                ))}
              </span>
            ) : (
              <span className="editor-empty">รับทุกวัตถุประสงค์</span>
            )}
          </dd>

          {room.description && (
            <>
              <dt>รายละเอียด</dt>
              <dd className="editor-desc">{room.description}</dd>
            </>
          )}
        </dl>
      </div>
    </article>
  );
}

// ───────────────────────────────────────────────────────────
// Edit modal — only admin opens this
// ───────────────────────────────────────────────────────────
// Compute the next sequential ID like C037 from an existingIds Set.
// Falls back to C001 if no numeric IDs exist yet.
function computeNextId(existingIds) {
  if (!existingIds) return 'C001';
  const nums = Array.from(existingIds)
    .map((s) => /^C(\d+)$/.exec(String(s).trim()))
    .filter(Boolean)
    .map((m) => parseInt(m[1], 10));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `C${String(max + 1).padStart(3, '0')}`;
}

function RoomEditModal({ room, mode = 'edit', existingIds, onClose, onSaved, onDeleted }) {
  const isCreate = mode === 'create';
  const [id, setId] = useState(() =>
    room?.id ? room.id : isCreate ? computeNextId(existingIds) : ''
  );
  const [name, setName] = useState(room?.name || '');
  const [picture, setPicture] = useState(room?.picture || '');
  const [location, setLocation] = useState(room?.location || '');
  const [floor, setFloor] = useState(room?.floor || '');
  const [seats, setSeats] = useState(room?.seats || 0);
  const [status, setStatus] = useState(room?.status || 'available');
  const [equipment, setEquipment] = useState(room?.equipment || []);
  const [purposes, setPurposes] = useState(room?.purposes || []);
  const [description, setDescription] = useState(room?.description || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const toggle = (list, setter, item) =>
    setter(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const idConflict = isCreate && id && existingIds?.has(id.trim());
  const canSave = !!name.trim() && (!isCreate || (!!id.trim() && !idConflict));

  const handleDelete = async () => {
    if (isCreate || !room?.id) return;
    const ok = window.confirm(
      `ยืนยันลบห้อง "${room.name}" (${room.id})?\n\nการจองทั้งหมดของห้องนี้จะถูกลบด้วย — การกระทำนี้ย้อนกลับไม่ได้`
    );
    if (!ok) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteRoom(room.id);
      onDeleted?.(room.id);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setDeleting(false);
    }
  };

  // Upload a photo → named as {id}.{ext} and stored in Supabase Storage.
  // Overwrites any previous file for the same id on re-upload.
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const targetId = isCreate ? id.trim() : room?.id;
    if (!targetId) {
      setError('ใส่รหัสห้องก่อนจะอัปโหลดรูปได้');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${targetId}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, {
          contentType: file.type || 'image/jpeg',
          upsert: true,
          cacheControl: '3600',
        });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      // Add cache buster so browsers reload new upload instantly
      const url = `${data.publicUrl}?t=${Date.now()}`;
      setPicture(url);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        picture: picture.trim() || null,
        location: location.trim(),
        floor: floor.trim(),
        seats: +seats || 0,
        status,
        equipment,
        purposes,
        description: description.trim() || null,
      };
      const saved = isCreate
        ? await insertRoom({ id: id.trim(), ...payload })
        : await updateRoom(room.id, payload);
      onSaved(saved);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="wizard-modal" onClick={(e) => e.stopPropagation()}>
        <header className="wizard-head">
          <div>
            <div className="wizard-kicker">
              {isCreate ? 'เพิ่มห้องใหม่' : `${room.id} · ${location || '—'}`}
            </div>
            <h2 className="wizard-title">
              {isCreate ? 'เพิ่มห้องประชุม' : `แก้ไขห้อง ${room.name}`}
            </h2>
          </div>
          <button className="wizard-close" onClick={onClose} aria-label="ปิด">
            ✕
          </button>
        </header>

        <div className="wizard-body">
          <div className="wizard-section">
            <div className="wizard-section-h">ข้อมูลพื้นฐาน</div>

            {isCreate && (
              <label className="field field-full">
                <span className="field-label">
                  รหัสห้อง
                  <span style={{ color: 'var(--fg-3)', fontWeight: 400 }}> · ระบบตั้งให้อัตโนมัติ</span>
                </span>
                <input
                  className="field-input mono"
                  value={id}
                  readOnly
                  tabIndex={-1}
                  style={{ background: 'var(--bg-2)', color: 'var(--fg-2)', cursor: 'not-allowed' }}
                />
              </label>
            )}

            <label className="field field-full">
              <span className="field-label">ชื่อห้อง</span>
              <input
                className="field-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="เช่น ห้องพุทธรักษา"
              />
            </label>

            <div className="field field-full">
              <span className="field-label">
                รูปห้อง
                {uploading && <span style={{ color: 'var(--accent-ink)' }}> · กำลังอัปโหลด…</span>}
              </span>
              {picture && (
                <div
                  className="room-photo-preview"
                  style={{ backgroundImage: `url(${picture})` }}
                />
              )}
              <label className="room-upload-btn">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                  disabled={uploading || (isCreate && !id.trim())}
                />
                <span>
                  {picture ? '📷 เปลี่ยนรูป' : '📷 เลือกรูปจากเครื่อง'}
                </span>
              </label>
              {isCreate && !id.trim() && (
                <span className="field-hint">ใส่รหัสห้องก่อน แล้วระบบจะตั้งชื่อรูปให้อัตโนมัติ</span>
              )}
              {picture && (
                <span className="field-hint mono" style={{ fontSize: 10.5, wordBreak: 'break-all' }}>
                  {picture.split('?')[0]}
                </span>
              )}
            </div>
            <div className="field-row">
              <label className="field field-grow">
                <span className="field-label">สถานที่</span>
                <input
                  className="field-input"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Comets HQ, ICT, Phone Booth"
                />
              </label>
              <label className="field">
                <span className="field-label">ชั้น</span>
                <input
                  className="field-input"
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                  placeholder="ชั้น 1"
                />
              </label>
              <label className="field">
                <span className="field-label">ที่นั่ง</span>
                <input
                  type="number"
                  className="field-input"
                  min={0}
                  value={seats}
                  onChange={(e) => setSeats(+e.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">สถานะ</span>
                <select
                  className="field-input"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="available">available</option>
                  <option value="unavailable">unavailable</option>
                </select>
              </label>
            </div>
          </div>

          <div className="wizard-section">
            <div className="wizard-section-h">
              อุปกรณ์ที่มีในห้อง
              <span className="wizard-section-count">เลือกได้หลายรายการ</span>
            </div>
            <div className="chip-row">
              {EQUIPMENT_OPTIONS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`chip ${equipment.includes(k) ? 'chip-on' : ''}`}
                  onClick={() => toggle(equipment, setEquipment, k)}
                >
                  {equipment.includes(k) && <span className="chip-check">✓</span>}
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div className="wizard-section">
            <div className="wizard-section-h">
              วัตถุประสงค์ที่ห้องนี้รับ
              <span className="wizard-section-count">
                ไม่เลือก = รับทุกวัตถุประสงค์
              </span>
            </div>
            <div className="chip-row">
              {PURPOSE_OPTIONS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`chip ${purposes.includes(k) ? 'chip-on' : ''}`}
                  onClick={() => toggle(purposes, setPurposes, k)}
                >
                  {purposes.includes(k) && <span className="chip-check">✓</span>}
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div className="wizard-section">
            <div className="wizard-section-h">รายละเอียดเพิ่มเติม</div>
            <label className="field field-full">
              <span className="field-label">คำอธิบาย (optional)</span>
              <textarea
                className="field-input"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="เช่น ห้องมีหน้าต่างกระจกใหญ่ เหมาะกับประชุมขนาดเล็ก"
              />
            </label>
          </div>

          {error && <div className="view-error">บันทึกไม่สำเร็จ: {error}</div>}
        </div>

        <div className="wizard-foot">
          {!isCreate && (
            <button
              className="btn-ghost danger"
              onClick={handleDelete}
              disabled={saving || deleting}
            >
              {deleting ? 'กำลังลบ…' : '🗑 ลบห้อง'}
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={saving || deleting || !canSave}
          >
            {saving ? 'กำลังบันทึก…' : isCreate ? 'เพิ่มห้อง' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}
