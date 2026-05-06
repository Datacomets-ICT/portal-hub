# Meeting Rooms · ระบบจองห้องประชุม

React + Vite + Supabase — timeline-based room booking for Comets HQ / ICT / Phone Booth.

🌐 **Live:** https://meeting-rooms-nu.vercel.app

## Stack
- **Vite + React 18** — frontend build + dev server
- **Supabase** — Postgres DB + auto REST API (`rooms`, `employees`, `bookings`)
- **Vercel** — static hosting with auto-deploy from GitHub

## Local development

```bash
# 1. Install deps
npm install

# 2. Set up Supabase credentials
cp .env.example .env.local
# then edit .env.local with your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# 3. (First time) Run schema + seed in Supabase SQL Editor
#    Open Supabase Dashboard → SQL Editor → New query
#    Paste contents of supabase/schema.sql → Run
#    Paste contents of supabase/seed.sql   → Run

# 4. Dev server
npm run dev        # http://localhost:5173
```

## Deploy

### Supabase (once)
1. Create a project at https://supabase.com
2. **SQL Editor** → paste `supabase/schema.sql` → Run
3. **SQL Editor** → paste `supabase/seed.sql` → Run
4. **Project Settings → API** → copy `URL` and `anon` key

### Vercel (auto-deploy from GitHub)
1. Push repo to GitHub
2. Go to https://vercel.com/new → import the repo
3. Framework: **Vite** (auto-detected)
4. **Environment Variables** → add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy

Subsequent pushes to `master` auto-deploy.

## Project structure

```
.
├── index.html                 # Vite entry
├── package.json
├── vite.config.js
├── public/
│   └── rooms_Images/          # 36 room photos (served as-is)
├── src/
│   ├── main.jsx               # React mount
│   ├── App.jsx                # top-level app + data orchestration
│   ├── components.jsx         # TimelineHeader / TimelineRow / BookingModal
│   ├── styles.css
│   ├── lib/
│   │   └── supabase.js        # Supabase client (reads env vars)
│   └── api/
│       ├── rooms.js
│       ├── employees.js
│       └── bookings.js        # CRUD + row ⇄ UI mappers
└── supabase/
    ├── schema.sql             # tables + RLS policies
    └── seed.sql               # initial rooms / employees / sample bookings
```

## Notes on Row-Level Security
The demo policies allow **anonymous read/write** on `bookings`.
For a real deployment, replace with auth-gated policies (e.g. only authenticated users can insert, and only booking owner can delete).
