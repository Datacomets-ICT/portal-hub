// ============================================================
// Driver Booking — frontend data layer
//
// Master data (places / cars / drivers) is loaded from Supabase on
// boot. We start with empty arrays and the app re-renders once
// loadDriverData() finishes (called from app.jsx).
//
// Fallback: if the load fails (offline / RLS misconfigured), the
// arrays stay empty and the booking form will show "no places yet"
// instead of crashing.
// ============================================================

let EMPLOYEES      = [];     // populated from sessionStorage by app.jsx (portal SSO)
let PICKUP_PLACES  = [];
let DROPOFF_PLACES = [];
let CARS           = [];
let DRIVERS        = [];

const JOB_TYPES = [
  { id: "meeting",  label: "ประชุมลูกค้า",        icon: "💼" },
  { id: "delivery", label: "ส่งเอกสาร/พัสดุ",      icon: "📦" },
  { id: "airport",  label: "รับ–ส่งสนามบิน",       icon: "✈️" },
  { id: "event",    label: "งานอีเวนต์/สัมมนา",   icon: "🎤" },
  { id: "site",     label: "ตรวจไซต์งาน",         icon: "🏗️" },
  { id: "other",    label: "อื่น ๆ",              icon: "•••" },
];

const PURPOSES = [
  "ประชุมภายนอก",
  "รับรองลูกค้า",
  "ตรวจงาน / ตรวจสอบ",
  "อบรม / สัมมนา",
  "ติดต่อราชการ",
  "อื่น ๆ (ระบุ)",
];

// Empty bookings array — real data is loaded via drv_get_my_bookings
let SAMPLE_BOOKINGS = [];

// Load master data + (optionally) my bookings. Returns a promise so
// app.jsx can await on boot.
async function loadDriverData() {
  if (!window.sb) return;
  try {
    const [places, cars, drivers] = await Promise.all([
      window.sb.from('drv_places').select('*').eq('active', true),
      window.sb.from('drv_cars').select('*').eq('active', true),
      window.sb.from('drv_drivers').select('*').eq('active', true),
    ]);

    if (places.data) {
      const list = places.data.map(p => ({
        id: p.id,
        name: p.name,
        detail: p.detail || '',
        map: p.map_url || '',
        kind: p.kind,
      }));
      PICKUP_PLACES.length = 0;
      DROPOFF_PLACES.length = 0;
      list.forEach(p => {
        if (p.kind === 'pickup' || p.kind === 'both') PICKUP_PLACES.push(p);
        if (p.kind === 'dropoff' || p.kind === 'both') DROPOFF_PLACES.push(p);
      });
    }

    if (cars.data) {
      CARS.length = 0;
      cars.data.forEach(c => CARS.push({
        id: c.id, plate: c.plate, model: c.model, seats: c.seats, color: c.color,
      }));
    }

    if (drivers.data) {
      DRIVERS.length = 0;
      drivers.data.forEach(d => DRIVERS.push({
        id: d.id, driver_no: d.driver_no, name: d.name, phone: d.phone,
      }));
    }
  } catch (err) {
    console.warn('[Driver] loadDriverData failed', err);
  }
}

// Load the calling user's bookings (called by screens-track / home).
// Maps DB rows back into the shape the frontend expects.
async function fetchMyBookings(empId, password) {
  if (!window.sb || !empId) return [];
  try {
    const { data, error } = await window.sb.rpc('drv_get_my_bookings', {
      p_emp_id: empId,
      p_password: password,
    });
    if (error) throw error;
    if (!data || !data.success) throw new Error(data?.message || 'fetch failed');
    return (data.bookings || []).map(rowToBooking);
  } catch (err) {
    console.warn('[Driver] fetchMyBookings failed', err);
    return [];
  }
}

function rowToBooking(r) {
  const employee = {
    id:    r.employee_id,
    name:  r.employee_name,
    dept:  r.employee_dept,
    phone: r.employee_phone,
  };
  const job = JOB_TYPES.find(j => j.id === r.job_type) || { id: r.job_type, label: r.job_type, icon: '•' };
  const pickup  = { name: r.pickup_name,  detail: r.pickup_detail  || '', map: r.pickup_map  || '' };
  const dropoff = { name: r.dropoff_name, detail: r.dropoff_detail || '', map: r.dropoff_map || '' };
  return {
    key: r.key,
    id: r.booking_no,
    employee,
    date: r.date,
    timeOut: (r.time_out || '').slice(0, 5),
    timeArrive: (r.time_arrive || '').slice(0, 5),
    timeBack: (r.time_back || '').slice(0, 5),
    job,
    pickup, dropoff,
    purpose: r.purpose,
    purposeDetail: r.purpose_detail,
    status: r.status,
    car:    r.car_plate    ? { plate: r.car_plate,    model: r.car_model, seats: r.car_seats, color: r.car_color } : null,
    driver: r.driver_name  ? { id: r.driver_no, name: r.driver_name, phone: r.driver_phone } : null,
    createdAt: r.created_at ? new Date(r.created_at).toLocaleString('sv-SE').slice(0, 16) : '',
    rejectedReason: r.rejected_reason,
    cancelReason: r.cancel_reason,
    timeline: buildTimeline(r),
  };
}

function buildTimeline(r) {
  const fmt = (ts) => ts ? new Date(ts).toLocaleString('th-TH', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}) : '—';
  const items = [
    { at: fmt(r.created_at), label: 'ส่งคำขอจอง', done: true },
  ];
  if (r.status === 'rejected') {
    items.push({ at: fmt(r.approved_at), label: 'หัวหน้าไม่อนุมัติ' + (r.rejected_reason ? ` (${r.rejected_reason})` : ''), done: true });
  } else {
    items.push({ at: r.approved_at ? fmt(r.approved_at) : '—', label: 'หัวหน้าอนุมัติ', done: !!r.approved_at });
    items.push({ at: r.assigned_at ? fmt(r.assigned_at) : '—', label: 'จัดสรรรถและคนขับ', done: !!r.assigned_at });
  }
  if (r.status === 'completed') {
    items.push({ at: '—', label: 'เดินทางเสร็จสิ้น', done: true });
  }
  if (r.status === 'cancelled') {
    items.push({ at: fmt(r.cancelled_at), label: 'ยกเลิกโดยผู้แจ้ง' + (r.cancel_reason ? ` (${r.cancel_reason})` : ''), done: true });
  }
  return items;
}

Object.assign(window, {
  EMPLOYEES, PICKUP_PLACES, DROPOFF_PLACES, JOB_TYPES, PURPOSES, CARS, DRIVERS, SAMPLE_BOOKINGS,
  loadDriverData, fetchMyBookings,
});
