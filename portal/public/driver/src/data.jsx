// Mock employees, places, job types, purposes, bookings
const EMPLOYEES = [
  { id: "EMP10234", name: "ธนพล สุขสวัสดิ์", dept: "ฝ่ายจัดซื้อ", phone: "081-234-5678" },
  { id: "EMP10456", name: "ศิริพร วงศ์วิวัฒน์", dept: "ฝ่ายบัญชี", phone: "089-456-1122" },
  { id: "EMP10781", name: "ณัฐวุฒิ ชัยมงคล", dept: "ฝ่ายวิศวกรรม", phone: "082-890-3311" },
  { id: "EMP11002", name: "พิมพ์ชนก ตั้งใจดี", dept: "ฝ่ายการตลาด", phone: "086-110-9022" },
];

const PICKUP_PLACES = [
  { id: "p1", name: "สำนักงานใหญ่ อาคาร A", detail: "ล็อบบี้ชั้น 1 ถ.พระราม 9", map: "https://maps.google.com/?q=13.7563,100.5018" },
  { id: "p2", name: "โรงงาน บางพลี", detail: "123 ม.5 ต.บางพลีใหญ่ จ.สมุทรปราการ", map: "https://maps.google.com/?q=13.6103,100.7450" },
  { id: "p3", name: "คลังสินค้า รังสิต", detail: "ถ.พหลโยธิน กม.35", map: "https://maps.google.com/?q=14.0132,100.7337" },
  { id: "p4", name: "ศูนย์ฝึกอบรม หัวหิน", detail: "ริมชายหาดหัวหิน", map: "https://maps.google.com/?q=12.5684,99.9580" },
];

const DROPOFF_PLACES = [
  { id: "d1", name: "สนามบินสุวรรณภูมิ", detail: "อาคารผู้โดยสาร 1", map: "https://maps.google.com/?q=13.6900,100.7501" },
  { id: "d2", name: "สนามบินดอนเมือง", detail: "อาคาร 1 ผู้โดยสารในประเทศ", map: "https://maps.google.com/?q=13.9125,100.6068" },
  { id: "d3", name: "ศูนย์ประชุมสิริกิติ์", detail: "ถ.รัชดาภิเษก", map: "https://maps.google.com/?q=13.7234,100.5602" },
  { id: "d4", name: "ไบเทค บางนา", detail: "ถ.บางนา-ตราด กม.1", map: "https://maps.google.com/?q=13.6672,100.6101" },
  { id: "d5", name: "IMPACT เมืองทองธานี", detail: "ถ.แจ้งวัฒนะ", map: "https://maps.google.com/?q=13.9136,100.5417" },
];

const JOB_TYPES = [
  { id: "meeting", label: "ประชุมลูกค้า", icon: "💼" },
  { id: "delivery", label: "ส่งเอกสาร/พัสดุ", icon: "📦" },
  { id: "airport", label: "รับ–ส่งสนามบิน", icon: "✈️" },
  { id: "event", label: "งานอีเวนต์/สัมมนา", icon: "🎤" },
  { id: "site", label: "ตรวจไซต์งาน", icon: "🏗️" },
  { id: "other", label: "อื่น ๆ", icon: "•••" },
];

const PURPOSES = [
  "ประชุมภายนอก",
  "รับรองลูกค้า",
  "ตรวจงาน / ตรวจสอบ",
  "อบรม / สัมมนา",
  "ติดต่อราชการ",
  "อื่น ๆ (ระบุ)",
];

const CARS = [
  { plate: "กท 1234", model: "Toyota Commuter", seats: 10, color: "ขาว" },
  { plate: "กท 5678", model: "Toyota Fortuner", seats: 7, color: "เทา" },
  { plate: "กท 9012", model: "Honda Accord", seats: 4, color: "ดำ" },
  { plate: "กท 3456", model: "Isuzu D-Max", seats: 4, color: "น้ำเงิน" },
];

const DRIVERS = [
  { id: "DRV01", name: "สมชาย ใจดี", phone: "081-111-2233" },
  { id: "DRV02", name: "มานะ ขับดี", phone: "082-222-3344" },
  { id: "DRV03", name: "ประยุทธ์ รอบคอบ", phone: "083-333-4455" },
];

const SAMPLE_BOOKINGS = [
  {
    id: "BK-26041001",
    employee: EMPLOYEES[0],
    date: "2026-04-26",
    timeOut: "08:30",
    timeArrive: "10:00",
    timeBack: "16:30",
    job: JOB_TYPES[0],
    pickup: PICKUP_PLACES[0],
    dropoff: DROPOFF_PLACES[2],
    purpose: "ประชุมภายนอก",
    purposeDetail: "ประชุม Quarterly Review กับลูกค้า ABC Corp",
    status: "approved",
    car: CARS[1], driver: DRIVERS[0],
    createdAt: "2026-04-24 09:12",
    timeline: [
      { at: "24 เม.ย. 09:12", label: "ส่งคำขอจอง", done: true },
      { at: "24 เม.ย. 10:05", label: "หัวหน้าอนุมัติ", done: true },
      { at: "24 เม.ย. 14:20", label: "จัดสรรรถและคนขับ", done: true },
      { at: "26 เม.ย. 08:30", label: "เริ่มเดินทาง", done: false },
      { at: "26 เม.ย. 16:30", label: "เดินทางกลับถึง", done: false },
    ],
  },
  {
    id: "BK-26041002",
    employee: EMPLOYEES[0],
    date: "2026-04-28",
    timeOut: "07:00", timeArrive: "09:30", timeBack: "18:00",
    job: JOB_TYPES[2],
    pickup: PICKUP_PLACES[0],
    dropoff: DROPOFF_PLACES[0],
    purpose: "รับรองลูกค้า",
    purposeDetail: "รับ Mr. Tanaka จากสนามบินสุวรรณภูมิ",
    status: "pending",
    createdAt: "2026-04-24 13:40",
    timeline: [
      { at: "24 เม.ย. 13:40", label: "ส่งคำขอจอง", done: true },
      { at: "—", label: "รออนุมัติจากหัวหน้า", done: false },
      { at: "—", label: "จัดสรรรถและคนขับ", done: false },
    ],
  },
  {
    id: "BK-26041003",
    employee: EMPLOYEES[0],
    date: "2026-04-22",
    timeOut: "13:00", timeArrive: "14:00", timeBack: "17:30",
    job: JOB_TYPES[1],
    pickup: PICKUP_PLACES[0],
    dropoff: DROPOFF_PLACES[3],
    purpose: "ส่งเอกสารสำคัญ",
    purposeDetail: "ส่งสัญญาให้บริษัท XYZ ที่ไบเทค",
    status: "completed",
    car: CARS[2], driver: DRIVERS[1],
    createdAt: "2026-04-20 11:22",
    timeline: [
      { at: "20 เม.ย. 11:22", label: "ส่งคำขอจอง", done: true },
      { at: "20 เม.ย. 15:00", label: "หัวหน้าอนุมัติ", done: true },
      { at: "21 เม.ย. 10:00", label: "จัดสรรรถและคนขับ", done: true },
      { at: "22 เม.ย. 13:00", label: "เริ่มเดินทาง", done: true },
      { at: "22 เม.ย. 17:35", label: "เดินทางกลับถึง", done: true },
    ],
  },
];

Object.assign(window, { EMPLOYEES, PICKUP_PLACES, DROPOFF_PLACES, JOB_TYPES, PURPOSES, CARS, DRIVERS, SAMPLE_BOOKINGS });
