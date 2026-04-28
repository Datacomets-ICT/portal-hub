# Portal

หน้า landing รวมของ 3 แอปภายในองค์กร — login ครั้งเดียว แล้วเลือกใช้ IT Ticket / Driver Booking / Meeting Rooms

## สิ่งที่เป็น

- Portal **ไม่แก้โค้ด**ของ 3 แอปเดิม — แค่ copy/build output ของแต่ละแอปเข้ามาที่ `public/` แล้ว deploy รวมกัน
- ทุกแอปอยู่ใต้ origin เดียวกัน (subpath) → `sessionStorage` / `localStorage` share กันได้
- Portal login เรียก `login(emp_id, password)` RPC ของ IT Supabase (โปรเจกต์ `dixechuojsfaypagbfqu`) แล้ว**เขียน auth state ทั้งของ IT และ meeting-rooms** ลง storage → เมื่อผู้ใช้คลิกไปแอปไหน แอปนั้นเห็น session อยู่แล้ว **ไม่ต้อง login ซ้ำ**

## โครงสร้าง

```
portal/
├── src/                      Portal UI (React + Vite)
├── scripts/sync-apps.mjs     รวม 3 แอปเข้า public/ (ไม่แตะ source)
├── public/
│   ├── it/                   IT_Ticket (copy จาก ../IT_Ticket/)
│   ├── meeting/              meeting-rooms (build output, base=/meeting/)
│   └── driver/               Driver (copy จาก ../Driver/)
└── .env.local                Supabase URL + anon key
```

## Setup ครั้งแรก

```bash
cd portal
cp .env.example .env.local      # ตรวจให้ URL + anon key ตรงกับ IT Supabase
npm install
npm run sync                    # สร้าง public/it, public/meeting (ต้อง npm install ใน meeting-rooms ก่อน), public/driver
npm run dev                     # เปิด http://localhost:5180
```

### Prerequisites

- Node 18+
- `../meeting-rooms` ต้อง `npm install` มาแล้ว (sync script จะเรียก `npm run build` ในนั้น)

## คำสั่ง

| Command | หน้าที่ |
|---|---|
| `npm run dev` | Dev server (http://localhost:5180) |
| `npm run build` | Build portal |
| `npm run sync` | Sync ทั้ง 3 แอปเข้า public/ |
| `npm run sync:it` | Sync เฉพาะ IT_Ticket |
| `npm run sync:meeting` | Build + sync meeting-rooms |
| `npm run sync:driver` | Sync Driver |

## Deploy

### Vercel (แนะนำ)

มี [`vercel.json`](../vercel.json) อยู่ที่ repo root แล้ว — Vercel จะ:
1. `npm install` ใน portal/ + meeting-rooms/
2. `npm run sync` รวม 3 แอปเข้า public/
3. `npm run build` สร้าง dist/
4. Rewrite config ให้ SPA fallback ไม่ทับ /it/ /meeting/ /driver/

**Step ตั้งค่าบน Vercel:**
1. Import repo ใน vercel.com
2. **Root Directory** เลือก `.` (repo root — ห้ามเลือก `portal/` เพราะ build ต้อง access sibling folders)
3. Framework Preset: Other
4. ปุ่ม Deploy (settings ที่เหลือ vercel.json คุมแล้ว)

ทั้งโปรเจกต์จะอยู่ใต้ URL เดียว เช่น `your-app.vercel.app/`
- `/login`, `/hub` → Portal
- `/it/` → IT_Ticket
- `/meeting/` → meeting-rooms
- `/driver/` → Driver

### Host อื่น (nginx / Netlify)

```bash
npm run sync         # รวมแอปเข้า public/
npm run build        # สร้าง dist/
# deploy dist/ — ตั้ง SPA fallback ให้ /login /hub fallback ไป /index.html แต่อย่าทับ /it /meeting /driver /assets
```

**สำคัญ:** deploy ต้องอยู่ origin เดียวกัน ถ้าแยก origin SSO จะไม่ทำงาน

## วิธี SSO (สำหรับอ้างอิง)

1. ผู้ใช้เข้า `/` → Portal redirect ไป `/login`
2. Login → Portal เรียก `supabase.rpc('login', { p_emp_id, p_password })` บน IT Supabase
3. Portal เขียนลง storage ทั้ง 3 key:
   - `sessionStorage['ticketUser']` + `['ticketPwd']` — IT อ่านตอน boot (ที่ `index.html:5917`) → auto enter
   - `localStorage['mr_user']` — meeting-rooms อ่านตอน boot (ที่ `App.jsx:45`) → auto enter
4. Hub ใช้ `window.location.href = '/it/'` (เปลี่ยน tab เดิม, ไม่เปิดใหม่) → แอปโหลดเห็น session ที่เขียนไว้แล้ว
5. Logout ที่ Portal → ล้าง storage ทั้ง 3 key

## ข้อควรระวัง

**meeting-rooms ใช้คนละ Supabase project** — Portal login ตรวจสอบ password จาก IT project แต่ meeting-rooms จะ query data จาก project ของตัวเอง
→ **employee code** ต้องตรงกันทั้ง 2 project (user ยืนยันแล้วว่าตรง)

**Driver** — ปัจจุบันยังไม่ใช้ Supabase และใช้ mock data → ปรับให้ auto-pass login ตาม flow เดิมได้ (ไม่มี login จริง)

**IT_Ticket PWA** — มี reference `/sw.js` ที่เดิม จะไม่ทำงานใต้ subpath `/it/` (ไม่กระทบฟีเจอร์หลัก) — ไม่แก้โค้ดตามคำสั่ง

**`get_user_apps` RPC** — Portal พยายามเรียก RPC นี้เพื่อ filter tiles ตาม role ของผู้ใช้ ถ้ายังไม่มี (return error) จะ fallback แสดงทั้ง 3 tile สามารถสร้าง RPC ทีหลังเพื่อ restrict per-employee ได้:

```sql
create or replace function get_user_apps(p_emp_id text)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
  -- return array of app keys: 'it' | 'driver' | 'meeting'
  -- ตัวอย่าง: ทุกคนเข้าได้หมด
  select array['it','driver','meeting'];
$$;

grant execute on function get_user_apps(text) to anon, authenticated;
```

## ไฟล์สำคัญ

- [src/App.jsx](src/App.jsx) — React Router
- [src/lib/auth.jsx](src/lib/auth.jsx) — AuthProvider ที่ทำ SSO (เขียน storage หลายที่)
- [src/pages/LoginPage.jsx](src/pages/LoginPage.jsx)
- [src/pages/HubPage.jsx](src/pages/HubPage.jsx) — ปุ่มไปแต่ละแอป (แก้ path/label ที่นี่)
- [scripts/sync-apps.mjs](scripts/sync-apps.mjs) — รวมแอปเข้า public/
