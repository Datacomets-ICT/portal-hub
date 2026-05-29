"""
Generate a data-driven dashboard PDF from the live Supabase databases.

- Pulls bookings + rooms from the meeting-rooms Supabase (real data, ~3,953 bookings)
- Pulls ticket aggregates from the IT Supabase (may be empty — shown as such)
- Renders a single HTML page with Chart.js then prints to A4 PDF

The dashboard is intentionally stand-alone: each visual is followed by a short
"การวิเคราะห์" block explaining what question it answers and what to look for.
"""
import json
import statistics
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parent
PDF = ROOT / "Portal_Dashboard.pdf"

# ---- Supabase endpoints (anon keys — safe to embed) ----
IT_URL = "https://dixechuojsfaypagbfqu.supabase.co"
IT_KEY = "sb_publishable_lLFnuVu8vg4GD2bkOmsxIA_IXdgwMmL"
MR_URL = "https://vtvtgzcgnwdgwewgvfag.supabase.co"
MR_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dnRnemNnbndkZ3dld2d2ZmFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MTk3NTQsImV4cCI6MjA5MjQ5NTc1NH0."
    "KD9JxvnhvDaANv4nwbIzotBcHo9IHcZxV_jm2Tunyuo"
)


def fetch_all(url: str, key: str, path: str, order: str | None = None, page_size: int = 1000) -> list[dict]:
    """Paginate a Supabase REST collection endpoint. Returns all rows."""
    rows: list[dict] = []
    offset = 0
    while True:
        params = {"select": "*"}
        if order:
            params["order"] = order
        headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Range-Unit": "items",
            "Range": f"{offset}-{offset + page_size - 1}",
        }
        r = requests.get(f"{url}/rest/v1/{path}", headers=headers, params=params, timeout=30)
        r.raise_for_status()
        batch = r.json()
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def count_header(url: str, key: str, path: str) -> int:
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Prefer": "count=exact"}
    r = requests.head(f"{url}/rest/v1/{path}?select=*", headers=headers, timeout=15)
    cr = r.headers.get("content-range", "*/0")
    return int(cr.split("/")[-1]) if "/" in cr else 0


# -----------------------------------------------------------
# Fetch
# -----------------------------------------------------------
print("Fetching data…")
try:
    bookings = fetch_all(MR_URL, MR_KEY, "bookings", order="booking_date.desc")
except Exception as e:
    print(f"  ! bookings fetch failed: {e}", file=sys.stderr)
    bookings = []

try:
    rooms = fetch_all(MR_URL, MR_KEY, "rooms")
except Exception as e:
    print(f"  ! rooms fetch failed: {e}", file=sys.stderr)
    rooms = []

tickets_count = count_header(IT_URL, IT_KEY, "tickets")

print(f"  bookings: {len(bookings):,}")
print(f"  rooms:    {len(rooms):,}")
print(f"  tickets:  {tickets_count:,} (IT Supabase)")


# -----------------------------------------------------------
# Aggregations
# -----------------------------------------------------------
def parse_date(s: str):
    try:
        return datetime.fromisoformat(s).date() if s else None
    except Exception:
        return None


total_bookings = len(bookings)
total_rooms = len(rooms)
unique_bookers = len({b.get("booker") for b in bookings if b.get("booker")})

durations_min = [
    (b["end_min"] - b["start_min"])
    for b in bookings
    if isinstance(b.get("start_min"), int) and isinstance(b.get("end_min"), int)
]
avg_duration = round(statistics.mean(durations_min) / 60, 2) if durations_min else 0

# Bookings per day (last 90 days)
today = datetime.now(timezone.utc).date()
start_day = today - timedelta(days=89)
by_day = Counter()
for b in bookings:
    d = parse_date(b.get("booking_date"))
    if d and start_day <= d <= today:
        by_day[d] += 1
day_labels = [(start_day + timedelta(days=i)).isoformat() for i in range(90)]
day_values = [by_day.get(datetime.fromisoformat(d).date(), 0) for d in day_labels]

# Hour of day distribution
by_hour = Counter()
for b in bookings:
    sm = b.get("start_min")
    if isinstance(sm, int):
        by_hour[sm // 60] += 1
hour_labels = [f"{h:02d}:00" for h in range(6, 21)]  # 06:00 - 20:00
hour_values = [by_hour.get(h, 0) for h in range(6, 21)]

# Top 10 rooms
room_name = {r["id"]: r.get("name", r["id"]) for r in rooms}
by_room = Counter(b["room_id"] for b in bookings if b.get("room_id"))
top_rooms = by_room.most_common(10)
room_labels = [room_name.get(rid, rid) for rid, _ in top_rooms]
room_values = [c for _, c in top_rooms]

# Day of week
th_days = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"]
by_dow = Counter()
for b in bookings:
    d = parse_date(b.get("booking_date"))
    if d:
        # Python weekday: 0=Mon, 6=Sun → shift to 0=Sun
        by_dow[(d.weekday() + 1) % 7] += 1
dow_values = [by_dow.get(i, 0) for i in range(7)]

# Purpose breakdown
by_purpose = Counter()
for b in bookings:
    p = (b.get("purpose") or "").strip() or "ไม่ระบุ"
    by_purpose[p] += 1
purpose_top = by_purpose.most_common(8)
purpose_labels = [p for p, _ in purpose_top]
purpose_values = [c for _, c in purpose_top]

# Duration histogram — bucket by 30-min intervals
dur_buckets = [0, 30, 60, 90, 120, 180, 240, 480]  # minutes
dur_labels = ["<30m", "30m", "1h", "1.5h", "2h", "3h", "4h", "4h+"]
dur_counts = [0] * len(dur_labels)
for m in durations_min:
    for i, upper in enumerate(dur_buckets):
        if m <= upper:
            dur_counts[i] += 1
            break
    else:
        dur_counts[-1] += 1

# Top bookers (top 10)
by_booker = Counter(b.get("booker") for b in bookings if b.get("booker"))
top_bookers = by_booker.most_common(10)
booker_labels = [n for n, _ in top_bookers]
booker_values = [c for _, c in top_bookers]

# Company breakdown (external customers visiting)
by_company = Counter()
for b in bookings:
    c = (b.get("company") or "").strip()
    if c:
        by_company[c] += 1
company_top = by_company.most_common(6)

# Monthly aggregate for trend commentary
by_month = Counter()
for b in bookings:
    d = parse_date(b.get("booking_date"))
    if d:
        by_month[(d.year, d.month)] += 1

peak_day = max(by_day.items(), key=lambda x: x[1]) if by_day else (None, 0)
peak_hour = max(by_hour.items(), key=lambda x: x[1]) if by_hour else (None, 0)
peak_dow = max(enumerate(dow_values), key=lambda x: x[1]) if dow_values else (0, 0)

data = {
    "bookings_total": total_bookings,
    "rooms_total": total_rooms,
    "unique_bookers": unique_bookers,
    "avg_duration": avg_duration,
    "tickets_total": tickets_count,
    "day_labels": day_labels,
    "day_values": day_values,
    "hour_labels": hour_labels,
    "hour_values": hour_values,
    "room_labels": room_labels,
    "room_values": room_values,
    "dow_labels": th_days,
    "dow_values": dow_values,
    "purpose_labels": purpose_labels,
    "purpose_values": purpose_values,
    "dur_labels": dur_labels,
    "dur_values": dur_counts,
    "booker_labels": booker_labels,
    "booker_values": booker_values,
    "generated_at": datetime.now().strftime("%d %b %Y · %H:%M"),
    "peak_day": f"{peak_day[0]} · {peak_day[1]} การจอง" if peak_day[0] else "—",
    "peak_hour": f"{peak_hour[0]:02d}:00 · {peak_hour[1]} การจอง" if peak_hour[0] is not None else "—",
    "peak_dow": f"{th_days[peak_dow[0]]} · {peak_dow[1]} การจอง",
    "months_span": len(by_month),
}


# -----------------------------------------------------------
# HTML Template
# -----------------------------------------------------------
HTML = r"""<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8">
<title>Portal Analytics Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
  @page { size: A4; margin: 10mm 10mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Sarabun','Noto Sans Thai','Segoe UI',Tahoma,sans-serif;
    font-size: 9.5pt;
    color: #0f172a;
    background: #f8fafc;
    margin: 0;
  }
  .page { padding: 0; }
  .header {
    background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
    color: white;
    padding: 16px 20px;
    border-radius: 10px;
    margin-bottom: 14px;
  }
  .header h1 { margin: 0; font-size: 20pt; font-weight: 800; letter-spacing: -0.5px; }
  .header .sub { margin: 4px 0 0; opacity: 0.85; font-size: 10pt; }
  .header .stamp { font-size: 9pt; opacity: 0.75; margin-top: 6px; }

  .kpi-row {
    display: grid; grid-template-columns: repeat(4, 1fr);
    gap: 10px; margin-bottom: 14px;
  }
  .kpi {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 12px 14px;
    box-shadow: 0 1px 3px rgba(15,23,42,.04);
  }
  .kpi .label { color: #64748b; font-size: 9pt; font-weight: 500; text-transform: uppercase; letter-spacing: 0.3px; }
  .kpi .value { color: #0f172a; font-size: 22pt; font-weight: 800; line-height: 1; margin-top: 6px; }
  .kpi .hint  { color: #94a3b8; font-size: 8.5pt; margin-top: 4px; }
  .kpi.accent-b .value { color: #1e40af; }
  .kpi.accent-g .value { color: #15803d; }
  .kpi.accent-o .value { color: #c2410c; }
  .kpi.accent-p .value { color: #7c3aed; }

  .chart-row {
    display: grid; gap: 10px; margin-bottom: 14px;
  }
  .chart-row.two  { grid-template-columns: 1fr 1fr; }
  .chart-row.wide { grid-template-columns: 1fr; }

  .card {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 12px 14px;
    page-break-inside: avoid;
  }
  .card h3 {
    margin: 0 0 2px;
    font-size: 11pt;
    font-weight: 700;
    color: #1e293b;
  }
  .card .q {
    font-size: 9pt;
    color: #64748b;
    margin: 0 0 8px;
  }
  .card .chart-wrap { position: relative; height: 180px; }
  .card .chart-wrap.tall { height: 220px; }

  .analysis {
    margin-top: 8px;
    padding: 8px 10px;
    background: #eff6ff;
    border-left: 3px solid #3b82f6;
    border-radius: 4px;
    font-size: 9pt;
    line-height: 1.5;
    color: #1e3a8a;
  }
  .analysis b { color: #1e40af; }

  .footer {
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px dashed #cbd5e1;
    font-size: 8.5pt;
    color: #64748b;
    text-align: center;
  }

  .section-title {
    font-size: 13pt;
    font-weight: 700;
    color: #1e293b;
    margin: 14px 0 8px;
    padding-left: 10px;
    border-left: 4px solid #3b82f6;
  }

  .page-break { page-break-before: always; }

  .insight-list {
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 10px;
    padding: 12px 18px;
    margin-bottom: 10px;
  }
  .insight-list ul { margin: 6px 0; padding-left: 22px; }
  .insight-list li { margin: 4px 0; font-size: 9.5pt; color: #78350f; }
  .insight-list li b { color: #b45309; }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <h1>Portal Analytics Dashboard</h1>
    <div class="sub">ศูนย์รวมข้อมูลการใช้งานระบบภายในองค์กร — Meeting Rooms · IT Ticket · Driver</div>
    <div class="stamp">ข้อมูล ณ __GEN__ · ดึงจาก Supabase แบบ real-time</div>
  </div>

  <div class="kpi-row">
    <div class="kpi accent-b">
      <div class="label">Total Bookings</div>
      <div class="value">__BK__</div>
      <div class="hint">ครอบคลุม __MONTHS__ เดือน</div>
    </div>
    <div class="kpi accent-g">
      <div class="label">ห้องประชุม</div>
      <div class="value">__RM__</div>
      <div class="hint">ห้องที่เปิดให้จอง</div>
    </div>
    <div class="kpi accent-o">
      <div class="label">ผู้ใช้ที่เคยจอง</div>
      <div class="value">__BKR__</div>
      <div class="hint">unique bookers</div>
    </div>
    <div class="kpi accent-p">
      <div class="label">ระยะเวลาเฉลี่ย</div>
      <div class="value">__DUR__ ชม.</div>
      <div class="hint">ต่อการจอง 1 ครั้ง</div>
    </div>
  </div>

  <div class="section-title">📊 Trend & Peak Analysis</div>

  <div class="chart-row wide">
    <div class="card">
      <h3>การจองรายวัน (90 วันย้อนหลัง)</h3>
      <p class="q">คำถาม: ปริมาณการใช้งานช่วงไหนพีค? มีแนวโน้มขึ้น/ลงไหม?</p>
      <div class="chart-wrap tall"><canvas id="c1"></canvas></div>
      <div class="analysis">
        <b>วิเคราะห์:</b> ดู trend การจองรายวันช่วง 90 วันย้อนหลัง
        — ถ้าเส้นพุ่งเป็น spike ในบางวันหมายถึง event ใหญ่ (ประชุมทั้งองค์กร)
        — ถ้าเส้นราบเรียบสม่ำเสมอหมายถึงการใช้งานปกติ
        <br><b>Peak วันที่จองมากที่สุด:</b> __PEAKD__
      </div>
    </div>
  </div>

  <div class="chart-row two">
    <div class="card">
      <h3>ช่วงเวลาที่นิยมจอง (Peak Hours)</h3>
      <p class="q">คำถาม: ช่วงชั่วโมงไหนห้องประชุมเต็มบ่อย?</p>
      <div class="chart-wrap"><canvas id="c2"></canvas></div>
      <div class="analysis">
        <b>วิเคราะห์:</b> Bar สูงที่สุด = ช่วงที่ยากจะจองได้
        — ใช้วางแผนเพิ่มห้องเสริม/ตั้ง policy limit ในช่วงพีค
        <br><b>ชั่วโมงพีค:</b> __PEAKH__
      </div>
    </div>
    <div class="card">
      <h3>การจองแยกตามวันในสัปดาห์</h3>
      <p class="q">คำถาม: วันไหนของสัปดาห์ใช้งานหนักสุด?</p>
      <div class="chart-wrap"><canvas id="c3"></canvas></div>
      <div class="analysis">
        <b>วิเคราะห์:</b> ระบุ pattern การประชุมองค์กร
        — ถ้าจันทร์/ศุกร์สูงมากหมายถึงประชุม kickoff/wrap-up
        — เสาร์-อาทิตย์ต่ำสะท้อนนโยบาย 5 วันทำงาน
        <br><b>วันที่ใช้มากสุด:</b> __PEAKDOW__
      </div>
    </div>
  </div>

  <div class="page-break"></div>

  <div class="section-title">🏢 Room & Utilization</div>

  <div class="chart-row two">
    <div class="card">
      <h3>Top 10 ห้องที่ถูกจองมากที่สุด</h3>
      <p class="q">คำถาม: ห้องไหน high-demand? ห้องไหน underused?</p>
      <div class="chart-wrap tall"><canvas id="c4"></canvas></div>
      <div class="analysis">
        <b>วิเคราะห์:</b> Bar ยาวสุด = ห้อง popular (อาจเพราะตำแหน่ง/ขนาด/อุปกรณ์)
        — ถ้าความต่างของ bar ชันมากแสดงว่าทรัพยากรกระจุกตัว
        — ควร promote ห้องรองหรือปรับปรุงจุดเด่น
      </div>
    </div>
    <div class="card">
      <h3>การกระจายของระยะเวลาการจอง</h3>
      <p class="q">คำถาม: ประชุมส่วนใหญ่สั้นหรือยาว?</p>
      <div class="chart-wrap tall"><canvas id="c5"></canvas></div>
      <div class="analysis">
        <b>วิเคราะห์:</b> Bucket ที่สูงสุด = ความยาวประชุมมาตรฐาน
        — ถ้ากระจุกที่ 1 ชม. แสดง meeting culture ของบริษัท
        — ถ้ายาวบ่อย (>2 ชม.) อาจต้องส่งเสริม async meeting
      </div>
    </div>
  </div>

  <div class="chart-row two">
    <div class="card">
      <h3>วัตถุประสงค์การจอง (Top 8)</h3>
      <p class="q">คำถาม: การประชุมประเภทไหนครอบงำห้อง?</p>
      <div class="chart-wrap tall"><canvas id="c6"></canvas></div>
      <div class="analysis">
        <b>วิเคราะห์:</b> วัตถุประสงค์ที่ใหญ่สุดใน donut
        = priority ของการใช้ห้องประชุม
        — นำไปใช้ออกแบบห้องเฉพาะทาง (เช่น ห้องสัมภาษณ์ถ้า interview เยอะ)
      </div>
    </div>
    <div class="card">
      <h3>Top 10 ผู้จองประจำ</h3>
      <p class="q">คำถาม: ใครคือ heavy user ของระบบ?</p>
      <div class="chart-wrap tall"><canvas id="c7"></canvas></div>
      <div class="analysis">
        <b>วิเคราะห์:</b> Power user = คนที่ใช้ระบบบ่อยสุด
        — เป็น champion ที่สามารถ feedback การปรับปรุง UX ได้ดี
        — หรือเป็น gatekeeper ที่จองให้ทีม (อาจต้องให้สิทธิ์ admin)
      </div>
    </div>
  </div>

  <div class="page-break"></div>

  <div class="section-title">🔍 Executive Summary</div>

  <div class="insight-list">
    <b>สรุป Insights สำคัญจากข้อมูลจริง:</b>
    <ul>
      <li><b>ปริมาณการใช้:</b> ระบบถูกใช้งานจริง __BK__ ครั้ง โดยมีผู้ใช้ __BKR__ คน เฉลี่ยประชุมละ __DUR__ ชั่วโมง → ระบบ active, มี adoption จริง</li>
      <li><b>ช่วงเวลาพีค:</b> เวลา __PEAKH__ และ วัน__PEAKDOW__ เป็นช่วงที่ห้องประชุมถูกจองมากที่สุด → ควรจัดหาห้องเพิ่ม/ใช้ hybrid meeting ในช่วงนี้</li>
      <li><b>ห้อง high-demand:</b> 10 ห้องแรกครอบครอง booking ส่วนใหญ่ (ดูกราฟ Top 10 Rooms) → อาจต้องลงทุน refresh ห้องที่ popular และโปรโมทห้องรอง</li>
      <li><b>Meeting culture:</b> ระยะเวลาการจองส่วนใหญ่ (ดูกราฟ Duration) สะท้อน rhythm การประชุมของบริษัท → ใช้ baseline ในการออกแบบ policy ประชุม</li>
      <li><b>IT Ticket:</b> ขณะนี้ tickets table มี __TK__ รายการ — หลัง go-live ใช้งานจริงจะมีข้อมูลให้วิเคราะห์เพิ่ม (volume, category, SLA)</li>
    </ul>
  </div>

  <div class="card">
    <h3>📌 ข้อแนะนำเชิง Action (Recommendations)</h3>
    <ol style="margin:6px 0 0; padding-left:22px; font-size:9.5pt; line-height:1.7;">
      <li><b>Capacity planning:</b> เพิ่มห้องหรือห้องสำรองในช่วงเวลาพีค — ดูจากกราฟ Peak Hours + Day of Week</li>
      <li><b>Room optimization:</b> สำหรับห้องที่ค่า booking ต่ำ → สำรวจสาเหตุ (ตำแหน่งไกล? อุปกรณ์ไม่พร้อม?) และปรับปรุง</li>
      <li><b>Policy:</b> ถ้าประชุมเฉลี่ยยาว > 1.5 ชม. → ส่งเสริมให้ตั้ง timebox และใช้ agenda</li>
      <li><b>Power user program:</b> ทาบทาม top 10 ผู้จอง → รับ feedback เพื่อปรับปรุงระบบ</li>
      <li><b>IT Ticket go-live:</b> หลังระบบใช้จริง dashboard นี้จะขยาย section เพื่อแสดง ticket volume / status / plant breakdown</li>
    </ol>
  </div>

  <div class="footer">
    Portal Analytics Dashboard · Generated automatically from live Supabase data ·
    Source: meeting-rooms & IT_Ticket projects · Data retrieved __GEN__
  </div>
</div>

<script id="__data__" type="application/json">__DATA_JSON__</script>
<script>
  const D = JSON.parse(document.getElementById('__data__').textContent);

  const BLUE  = '#3b82f6';
  const BLUE2 = '#1e40af';
  const GREEN = '#22c55e';
  const ORG   = '#f97316';
  const PURP  = '#8b5cf6';
  const PINK  = '#ec4899';
  const TEAL  = '#14b8a6';
  const YLW   = '#eab308';

  const PALETTE = [BLUE, GREEN, ORG, PURP, PINK, TEAL, YLW, BLUE2];

  const commonOpts = (extra = {}) => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
      ...(extra.plugins || {}),
    },
    scales: extra.scales,
  });

  // 1. Daily trend (line)
  new Chart(document.getElementById('c1'), {
    type: 'line',
    data: {
      labels: D.day_labels.map(s => s.slice(5)),
      datasets: [{
        data: D.day_values,
        borderColor: BLUE,
        backgroundColor: 'rgba(59,130,246,.12)',
        borderWidth: 1.5,
        fill: true,
        tension: 0.35,
        pointRadius: 0,
      }],
    },
    options: commonOpts({
      scales: {
        x: { ticks: { maxTicksLimit: 10, font: { size: 9 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { font: { size: 9 } }, grid: { color: '#f1f5f9' } },
      },
    }),
  });

  // 2. Hour of day (bar)
  new Chart(document.getElementById('c2'), {
    type: 'bar',
    data: {
      labels: D.hour_labels,
      datasets: [{
        data: D.hour_values,
        backgroundColor: D.hour_values.map(v => {
          const mx = Math.max(...D.hour_values) || 1;
          const t = v / mx;
          return t > 0.75 ? ORG : t > 0.4 ? BLUE : '#cbd5e1';
        }),
        borderRadius: 4,
      }],
    },
    options: commonOpts({
      scales: {
        x: { ticks: { font: { size: 8 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { font: { size: 9 } }, grid: { color: '#f1f5f9' } },
      },
    }),
  });

  // 3. Day of week (bar)
  new Chart(document.getElementById('c3'), {
    type: 'bar',
    data: {
      labels: D.dow_labels,
      datasets: [{
        data: D.dow_values,
        backgroundColor: [PURP, BLUE, GREEN, ORG, PINK, TEAL, YLW],
        borderRadius: 6,
      }],
    },
    options: commonOpts({
      scales: {
        x: { ticks: { font: { size: 9 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { font: { size: 9 } }, grid: { color: '#f1f5f9' } },
      },
    }),
  });

  // 4. Top rooms (horizontal bar)
  new Chart(document.getElementById('c4'), {
    type: 'bar',
    data: {
      labels: D.room_labels,
      datasets: [{
        data: D.room_values,
        backgroundColor: BLUE,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { beginAtZero: true, ticks: { font: { size: 9 } }, grid: { color: '#f1f5f9' } },
        y: { ticks: { font: { size: 8.5 } }, grid: { display: false } },
      },
    },
  });

  // 5. Duration histogram (bar)
  new Chart(document.getElementById('c5'), {
    type: 'bar',
    data: {
      labels: D.dur_labels,
      datasets: [{
        data: D.dur_values,
        backgroundColor: GREEN,
        borderRadius: 6,
      }],
    },
    options: commonOpts({
      scales: {
        x: { ticks: { font: { size: 9 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { font: { size: 9 } }, grid: { color: '#f1f5f9' } },
      },
    }),
  });

  // 6. Purpose donut
  new Chart(document.getElementById('c6'), {
    type: 'doughnut',
    data: {
      labels: D.purpose_labels,
      datasets: [{
        data: D.purpose_values,
        backgroundColor: PALETTE,
        borderWidth: 1,
        borderColor: '#fff',
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { font: { size: 8.5 }, boxWidth: 10, padding: 6 },
        },
        tooltip: { enabled: false },
      },
      cutout: '55%',
    },
  });

  // 7. Top bookers (horizontal bar)
  new Chart(document.getElementById('c7'), {
    type: 'bar',
    data: {
      labels: D.booker_labels,
      datasets: [{
        data: D.booker_values,
        backgroundColor: PURP,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { beginAtZero: true, ticks: { font: { size: 9 } }, grid: { color: '#f1f5f9' } },
        y: { ticks: { font: { size: 8.5 } }, grid: { display: false } },
      },
    },
  });

  window.__charts_ready = true;
</script>
</body>
</html>
"""


def main():
    html = (
        HTML
        .replace("__GEN__", data["generated_at"])
        .replace("__BK__", f"{data['bookings_total']:,}")
        .replace("__RM__", f"{data['rooms_total']:,}")
        .replace("__BKR__", f"{data['unique_bookers']:,}")
        .replace("__DUR__", f"{data['avg_duration']}")
        .replace("__TK__", f"{data['tickets_total']:,}")
        .replace("__MONTHS__", str(data["months_span"]))
        .replace("__PEAKD__", data["peak_day"])
        .replace("__PEAKH__", data["peak_hour"])
        .replace("__PEAKDOW__", data["peak_dow"])
        .replace("__DATA_JSON__", json.dumps(data, ensure_ascii=False))
    )

    tmp_html = ROOT / "_dashboard_tmp.html"
    tmp_html.write_text(html, encoding="utf-8")

    print("Rendering PDF…")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1200, "height": 1600})
        page.goto(f"file:///{tmp_html.as_posix()}")
        page.wait_for_load_state("networkidle")
        page.wait_for_function("window.__charts_ready === true", timeout=20000)
        page.wait_for_timeout(1000)
        page.pdf(
            path=str(PDF),
            format="A4",
            margin={"top": "10mm", "right": "10mm", "bottom": "10mm", "left": "10mm"},
            print_background=True,
        )
        browser.close()

    tmp_html.unlink(missing_ok=True)
    print(f"[OK] Dashboard PDF: {PDF}")


if __name__ == "__main__":
    main()
