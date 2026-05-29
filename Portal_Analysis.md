# Portal — ศูนย์รวมระบบภายในองค์กร

**Single sign-on สำหรับ IT Ticket · Driver Booking · Meeting Rooms**

*เอกสารสรุปการออกแบบและการพัฒนา*

---

## 1. สรุปผู้บริหาร (Executive Summary)

Portal คือเว็บแอปตัวกลางที่รวม 3 ระบบภายในองค์กรเดิมเข้าด้วยกันผ่าน URL เดียว ผู้ใช้ **ล็อกอินเพียงครั้งเดียว** ที่ Portal แล้วเลือกแอปที่ต้องการใช้ได้ทันที — ไม่ต้องจำรหัสผ่านหลายชุด ไม่ต้องล็อกอินซ้ำในแต่ละแอป

ผลลัพธ์: URL เดียวคือ **`portal-hub-nine.vercel.app`** ให้บริการทั้ง 3 ระบบโดย**ไม่ได้แก้ไข logic หลักของแอปเดิม**

| ก่อน | หลัง |
|---|---|
| 3 URL, 3 หน้า login, คนละ Supabase project | 1 URL, 1 หน้า login, SSO ใช้ร่วมกัน |
| Employee code กระจายอยู่ใน 2 projects | Validate ที่เดียว (IT Supabase), ใช้ code เดียวกัน |
| User ต้องจำหลายรหัสผ่าน | รหัสพนักงาน + password ชุดเดียว |

---

## 2. ปัญหาและโจทย์

### สถานะเดิม

| แอป | เทคโนโลยี | Supabase | Auth |
|---|---|---|---|
| **IT Ticket** | Static HTML 5,963 บรรทัด + vanilla JS | `dixechuojsfaypagbfqu` | `login()` RPC + sessionStorage |
| **Meeting Rooms** | Vite + React | `vtvtgzcgnwdgwewgvfag` | Employee code → localStorage |
| **Driver** | React ผ่าน CDN Babel (ยังไม่มี backend) | — | Mock data |

### โจทย์จากผู้ใช้

1. "ทำ App รวม Login แล้วเข้าไปเลือกได้ว่าจะทำอะไร"
2. "ห้ามแตะการทำงานของ 2 เว็บที่ทำเสร็จแล้ว"
3. "รวมเป็นลิ้งค์เดียว" (deploy รวม)

### ข้อจำกัดเทคนิคที่พบ

- **Supabase ไม่มี SSO ข้าม project** — `auth.users` และ RLS ผูกกับ project id ตัวเอง
- **IT Ticket ไม่ได้ใช้ Supabase Auth จริง** — ใช้ `employees` table + custom RPC
- **meeting-rooms login ใช้แค่ employee code** — ไม่มี password
- **Browser storage (sessionStorage/localStorage) share ได้เฉพาะ same-origin** — ถ้า deploy คนละ domain SSO ใช้ไม่ได้

---

## 3. สถาปัตยกรรมที่เลือกใช้

### หลักการ: Same-origin + Shared Storage SSO

```
  ┌─────────────────────────────────────────────────┐
  │   portal-hub-nine.vercel.app  (origin เดียว)    │
  │                                                  │
  │   /login  /hub  /register  ← Portal (React)     │
  │   /it/*                    ← IT Ticket (static) │
  │   /meeting/*               ← Meeting (Vite)     │
  │   /driver/*                ← Driver (React CDN) │
  └─────────────────────────────────────────────────┘
              │
              │  Same origin → sessionStorage + localStorage share ได้
              ▼
   ┌────────────────────────────────────┐
   │  sessionStorage['ticketUser']      │ ← IT อ่าน → auto-enter
   │  sessionStorage['ticketPwd']       │
   │  localStorage['mr_user']           │ ← Meeting อ่าน → auto-enter
   └────────────────────────────────────┘
```

### Flow การ Login

1. User เข้า `portal-hub-nine.vercel.app` → redirect ไป `/login`
2. กรอกรหัสพนักงาน + password → Portal เรียก `supabase.rpc('login', ...)` บน IT Supabase
3. **Portal เขียน storage 3 key พร้อมกัน:**
   - `sessionStorage.ticketUser` (object จาก IT's login RPC)
   - `sessionStorage.ticketPwd` (password)
   - `localStorage.mr_user` (object shape เดียวกับที่ meeting-rooms คาดหวัง: `{code, name, nickname, dept, position}`)
4. Redirect ไป `/hub` → แสดง 3 tiles
5. คลิก tile → `window.location.href = '/it/'` (หรือ meeting/driver)
6. แต่ละแอปบูท → อ่าน storage ของตัวเอง → เจอ session → **ข้ามหน้า login ของแอป**

### การออกจากระบบ

- Portal มีปุ่ม "ออกจากระบบ" ที่ Hub → ล้าง storage ทั้ง 3 key ครั้งเดียว sign out หมด
- แต่ละแอป**ไม่มีปุ่ม logout แยก** → ใช้ปุ่ม "← Hub" กลับมา Portal แทน

---

## 4. ส่วนประกอบ (Components)

### 4.1 Portal (ใหม่)

```
portal/
├── src/
│   ├── App.jsx              React Router
│   ├── main.jsx
│   ├── lib/
│   │   ├── supabase.js      Shared client
│   │   └── auth.jsx         AuthProvider + SSO storage sync
│   ├── pages/
│   │   ├── LoginPage.jsx    Hero + form + forgot password modal
│   │   ├── RegisterPage.jsx Full form (company radio, 8 fields)
│   │   └── HubPage.jsx      Tile grid + greeting + clock
│   └── styles.css
├── public/
│   ├── it/                  IT_Ticket bundled (copy)
│   ├── meeting/             meeting-rooms bundled (vite build)
│   └── driver/              Driver bundled (copy)
├── scripts/sync-apps.mjs    รวม 3 แอปเข้า public/ โดยไม่แก้ source
├── package.json
└── vite.config.js
```

### 4.2 การ Bundle 3 แอปเข้าด้วยกัน

Script `sync-apps.mjs` ทำ 3 อย่างต่อเนื่อง:

| แอป | วิธีรวม |
|---|---|
| **IT Ticket** | Copy `IT_Ticket/index.html` + assets (`manifest.json`, `sw.js`, icons, `manual_images/`) → `portal/public/it/` |
| **Meeting Rooms** | `cd meeting-rooms && npm run build --base=/meeting/` → copy `dist/*` → `portal/public/meeting/` |
| **Driver** | Copy `Driver/*.html` + `src/` → `portal/public/driver/` |

Meeting-rooms build ต้อง **override env vars** (`VITE_SUPABASE_URL/KEY`) ด้วย `VITE_MEETING_*` ของ Vercel ไม่ให้ portal's IT URL รั่วเข้าไป

### 4.3 การแก้ไขในแอปเดิม (เฉพาะส่วนที่จำเป็น)

*หลังจากผู้ใช้อนุญาตให้เพิ่ม navigation*

| แอป | สิ่งที่แก้ |
|---|---|
| **IT Ticket** | +ปุ่ม "← Hub" บนซ้าย, ลบ menu "ออกจากระบบ", ลบ tab Dashboard |
| **Meeting Rooms** | +ปุ่ม "← Hub" บนซ้าย, ลบปุ่ม logout ขวา |
| **Driver** | +ปุ่ม "← Hub" บนซ้าย, ลบปุ่ม "ออกจากระบบ", +auto-skip login (อ่าน `sessionStorage.ticketUser`) |

---

## 5. Features ในหน้า Portal

### 5.1 หน้า Login

- **Split-panel layout:** hero ซ้าย (brand + feature list) + form ขวา
- **Forgot password modal** — เรียก RPC `request_password_reset(p_emp_id, p_note)` (ใช้ RPC เดิมของ IT)
- **Register link** → ไปหน้า `/register` (ใช้ RPC `register_employee`)
- Responsive: บนมือถือ hero ซ่อน, แสดงแค่ form

### 5.2 หน้า Register

- Form 8 fields: รหัสพนักงาน, password, สังกัด (Comets/ICT/JA radio chips), ชื่อ-นามสกุล, ชื่อเล่น, ตำแหน่ง, อีเมล, เบอร์โทร
- Submit → `supabase.rpc('register_employee', ...)` → redirect กลับ `/login`

### 5.3 หน้า Hub

- **Top bar** — brand mark "P", user chip (avatar ตัวแรกของชื่อ), ปุ่มออกจากระบบ
- **Hero** — ทักทายตามเวลา (อรุณสวัสดิ์/บ่าย/เย็น) + แสดงวันที่-เวลาแบบ real-time (อัปเดตทุก 30 วิ)
- **3 tiles** — สีประจำแอป (IT=น้ำเงิน, Driver=ส้ม, Meeting=เขียว), hover lift + "เปิดแอป →" ขยับตอน hover
- **Role filter (optional)** — Hub พยายามเรียก RPC `get_user_apps(p_emp_id)` ถ้ามี → filter tiles ตาม role; ถ้าไม่มีก็ fallback แสดงทุก tile

---

## 6. Deployment

### Stack

- **Hosting:** Vercel (single project `portal-hub`)
- **Repo root:** `d:/Backup/ProjectCode/`
- **Vercel Root Directory:** `.` (จำเป็นต้องเป็น repo root เพราะ build ต้อง access sibling folders)

### vercel.json (repo root)

```json
{
  "installCommand": "cd portal && npm install && cd ../meeting-rooms && npm install",
  "buildCommand": "cd portal && npm run sync && npm run build",
  "outputDirectory": "portal/dist",
  "framework": null,
  "rewrites": [
    { "source": "/((?!it/|meeting/|driver/|assets/).*)", "destination": "/index.html" }
  ]
}
```

### Environment Variables (Vercel)

| Key | ค่า | ใช้ที่ |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://dixechuojsfaypagbfqu.supabase.co` | Portal (IT Supabase) |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_...` | Portal |
| `VITE_MEETING_SUPABASE_URL` | `https://vtvtgzcgnwdgwewgvfag.supabase.co` | Meeting build only (via sync script) |
| `VITE_MEETING_SUPABASE_ANON_KEY` | `eyJhbGci...` | Meeting build only |

### Rewrites

SPA fallback จับเฉพาะ path ที่ไม่ใช่ `/it/*`, `/meeting/*`, `/driver/*`, `/assets/*` → ป้องกันไม่ให้ portal ของ React Router ทับ path ของ static apps

---

## 7. สิ่งที่**ไม่ได้แก้**ในแอปเดิม (โดยเจตนา)

- **Logic ธุรกิจ:** ticket creation, booking logic, room allocation — เหมือนเดิม 100%
- **Database schema:** ไม่ได้ migrate ข้อมูลข้าม Supabase project
- **RPC ทั้งหมด:** `login`, `create_ticket`, `register_employee`, `request_password_reset` — Portal แค่ **เรียกใช้** RPC เดิม
- **CSS/Theme หลักของแต่ละแอป:** เฉพาะเพิ่มปุ่ม "← Hub" style ใหม่, ไม่เปลี่ยน design ภายใน
- **PWA/Service Worker ของ IT:** ยังคงทำงานเดิม (อาจมี warning เรื่อง path แต่ไม่กระทบฟีเจอร์)

---

## 8. Trade-offs ที่ยอมรับ

| Trade-off | เหตุผล |
|---|---|
| ต้องใช้ same-origin deployment | ทางเดียวที่ SSO ผ่าน storage จะทำงาน โดยไม่แตะโค้ดแอปเดิม |
| Meeting ยังใช้ Supabase แยก | Migrate schema + data = งานใหญ่, ไม่คุ้มสำหรับเฟสนี้ |
| Driver ยังเป็น mock | Driver เป็น prototype — wire Supabase เป็นเฟสถัดไป |
| ปุ่ม logout มีแค่ที่ Portal | Single point of sign-out ป้องกัน state ไม่ sync |
| Dashboard ของ IT ถูกซ่อน | ตามคำขอ user — สามารถเปิดกลับได้ใน 1 บรรทัด |

---

## 9. สิ่งที่ทำต่อในเฟสถัดไป (Recommended)

| Priority | Task |
|---|---|
| Medium | เพิ่ม `get_user_apps` RPC + ตาราง `app_access` → filter tiles ตาม role ของผู้ใช้จริง |
| Medium | ทำ Driver ให้ wire Supabase จริง (ตาราง `driver_vehicles`, `driver_bookings`) |
| Low | Migrate meeting-rooms schema + data เข้า IT Supabase → เหลือ project เดียว |
| Low | เปิด Dashboard ของ IT คืนถ้าต้องการ (แค่ uncomment 1 บรรทัด) |
| Low | ปรับ IT_Ticket's service worker path ให้เข้ากับ subpath `/it/` (PWA สมบูรณ์) |

---

## 10. ตารางสรุปเทคโนโลยี

| Component | Stack | Bundle size | หมายเหตุ |
|---|---|---|---|
| Portal | React 18 + Vite 5 + React Router 6 + @supabase/supabase-js | JS 367 KB / CSS 9 KB (gzipped: 108 KB + 3 KB) | ใหม่ทั้งหมด |
| IT Ticket | Vanilla HTML/JS + FontAwesome + Chart.js (CDN) | 5,963 บรรทัด HTML | แก้ ~15 บรรทัด |
| Meeting | React 18 + Vite 5 | 419 KB JS (gzipped: 120 KB) | แก้ ~10 บรรทัด |
| Driver | React 18 (CDN Babel) | ~200 KB source | แก้ ~15 บรรทัด |

---

## 11. Timeline การพัฒนา

1. **Phase 1:** สำรวจโค้ด 3 แอป, ประเมิน schema ของ Supabase, ยืนยันข้อจำกัด
2. **Phase 2:** Scaffold Portal (Vite + React Router + Supabase client + AuthContext)
3. **Phase 3:** Login/Hub UI + SSO storage sync logic
4. **Phase 4:** Sync script (bundle 3 apps เข้า `public/`)
5. **Phase 5:** Vercel deploy + env var setup
6. **Phase 6:** Forgot password + Register pages
7. **Phase 7:** Back-to-Hub button + cleanup (logout/dashboard)
8. **Phase 8:** Driver auto-skip login

---

*เอกสารสร้างอัตโนมัติโดย `generate_portal_pdf.py`*
