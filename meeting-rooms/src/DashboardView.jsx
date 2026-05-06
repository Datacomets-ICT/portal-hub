import { useState, useEffect, useMemo } from 'react';
import { fetchAllBookings } from './api/bookings';
import { fmtTimeColon } from './components.jsx';

const THAI_DAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ──────────── KPI card ────────────
function Kpi({ label, value, delta, sub }) {
  const hasDelta = delta !== undefined && delta !== null;
  const up = hasDelta && delta >= 0;
  const deltaColor = hasDelta ? (up ? 'var(--ok)' : 'var(--danger)') : undefined;
  const deltaSign = hasDelta ? (up ? '+' : '') : '';
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hasDelta && (
        <div className="kpi-delta" style={{ color: deltaColor }}>
          {deltaSign}{delta.toFixed(1)}% vs เดือนก่อน
        </div>
      )}
      {sub && !hasDelta && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

// ──────────── Vertical bar chart (daily counts) ────────────
function VerticalBarChart({ data, width = 680, height = 200, maxLabels = 14 }) {
  if (!data.length) return <div className="chart-empty">ไม่มีข้อมูล</div>;
  const max = Math.max(1, ...data.map((d) => d.value));
  const pad = { l: 36, r: 12, t: 14, b: 28 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const barGap = 2;
  const barWidth = Math.max(1, (w - barGap * (data.length - 1)) / data.length);
  const labelStep = Math.max(1, Math.ceil(data.length / maxLabels));
  const yTicks = [0, Math.round(max / 2), max];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg">
      {yTicks.map((t, i) => {
        const y = pad.t + h - (t / max) * h;
        return (
          <g key={i}>
            <line x1={pad.l} x2={width - pad.r} y1={y} y2={y} stroke="var(--line)" strokeDasharray="2 3" />
            <text x={pad.l - 6} y={y + 4} fontSize="10" textAnchor="end" fill="var(--fg-3)">{t}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const x = pad.l + i * (barWidth + barGap);
        const barH = (d.value / max) * h;
        const y = pad.t + h - barH;
        const showLabel = i % labelStep === 0 || i === data.length - 1;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barWidth} height={barH} fill="var(--accent)" rx="2">
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
            {showLabel && (
              <text x={x + barWidth / 2} y={height - 10} fontSize="10" textAnchor="middle" fill="var(--fg-3)">
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ──────────── Line chart (time-series) ────────────
// Shows every data point as a dot; thins x-axis labels when data is dense so they don't overlap.
function LineChart({ data, width = 680, height = 200, maxLabels = 14 }) {
  if (!data.length) return <div className="chart-empty">ไม่มีข้อมูล</div>;
  const max = Math.max(1, ...data.map((d) => d.value));
  const pad = { l: 36, r: 12, t: 14, b: 28 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const points = data.map((d, i) => {
    const x = pad.l + (i * w) / Math.max(1, data.length - 1);
    const y = pad.t + h - (d.value / max) * h;
    return { x, y, d };
  });
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${path} L ${points[points.length - 1].x} ${pad.t + h} L ${points[0].x} ${pad.t + h} Z`;
  const yTicks = [0, Math.round(max / 2), max];
  // Thin labels when data is dense: show at most `maxLabels` labels evenly spaced
  const labelStep = Math.max(1, Math.ceil(data.length / maxLabels));
  // Small dot when data is dense (avoid clutter)
  const dotR = data.length > 60 ? 1.6 : data.length > 24 ? 2.4 : 3.5;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg">
      {yTicks.map((t, i) => {
        const y = pad.t + h - (t / max) * h;
        return (
          <g key={i}>
            <line x1={pad.l} x2={width - pad.r} y1={y} y2={y} stroke="var(--line)" strokeDasharray="2 3" />
            <text x={pad.l - 6} y={y + 4} fontSize="10" textAnchor="end" fill="var(--fg-3)">{t}</text>
          </g>
        );
      })}
      <path d={areaPath} fill="var(--accent)" opacity="0.15" />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" />
      {points.map((p, i) => {
        const showLabel = i % labelStep === 0 || i === points.length - 1;
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={dotR} fill="var(--accent)">
              <title>{`${p.d.label}: ${p.d.value}`}</title>
            </circle>
            {showLabel && (
              <text x={p.x} y={height - 10} fontSize="10" textAnchor="middle" fill="var(--fg-3)">
                {p.d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ──────────── Pie chart ────────────
const PIE_COLORS = [
  'oklch(0.68 0.17 45)',
  'oklch(0.68 0.15 220)',
  'oklch(0.7 0.15 150)',
  'oklch(0.7 0.14 300)',
  'oklch(0.75 0.14 100)',
  'oklch(0.66 0.15 15)',
  'oklch(0.7 0.13 260)',
  'oklch(0.7 0.12 60)',
];

function PieChart({ data, size = 180, onSliceClick }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  if (total === 0) return <div className="chart-empty">ไม่มีข้อมูล</div>;
  const cx = size / 2, cy = size / 2, r = size / 2 - 2;
  let ang = -Math.PI / 2;
  const arcs = data.map((d, i) => {
    const delta = (d.value / total) * Math.PI * 2;
    const x1 = cx + r * Math.cos(ang);
    const y1 = cy + r * Math.sin(ang);
    const x2 = cx + r * Math.cos(ang + delta);
    const y2 = cy + r * Math.sin(ang + delta);
    const large = delta > Math.PI ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    ang += delta;
    return { path, color: PIE_COLORS[i % PIE_COLORS.length], d };
  });
  const handleClick = (label) => {
    if (!onSliceClick) return;
    onSliceClick(label);
  };
  return (
    <div className="pie-wrap">
      <svg viewBox={`0 0 ${size} ${size}`} className="pie-svg" style={{ width: size, height: size }}>
        {arcs.map((a, i) => (
          <path
            key={i}
            d={a.path}
            fill={a.color}
            stroke="var(--surface)"
            strokeWidth="1"
            style={{ cursor: onSliceClick ? 'pointer' : 'default' }}
            onClick={() => handleClick(data[i].label)}
          >
            <title>{`${data[i].label}: ${data[i].value} (คลิกดูรายการ)`}</title>
          </path>
        ))}
      </svg>
      <div className="pie-legend">
        {data.map((d, i) => (
          <button
            key={d.label}
            type="button"
            className="pie-item"
            onClick={() => handleClick(d.label)}
            disabled={!onSliceClick}
          >
            <span className="pie-dot" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
            <span className="pie-label">{d.label}</span>
            <span className="pie-count mono">
              {d.value} <span className="pie-pct">({((d.value / total) * 100).toFixed(0)}%)</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ──────────── Heatmap (weekday × hour) ────────────
// Shows Monday (dow=1) to Friday (dow=5) only. Weekends typically <1% of bookings.
const WEEKDAY_LABELS = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.'];

function Heatmap({ data, hourStart = 8, hourEnd = 18, onCellClick }) {
  const hours = [];
  for (let h = hourStart; h < hourEnd; h++) hours.push(h);
  let max = 1;
  for (let dow = 1; dow <= 5; dow++) {
    for (const h of hours) {
      if ((data[dow]?.[h] || 0) > max) max = data[dow][h];
    }
  }
  return (
    <div className="heatmap">
      <div className="hm-head">
        <div className="hm-corner" />
        {hours.map((h) => (
          <div key={h} className="hm-hour mono">{String(h).padStart(2, '0')}</div>
        ))}
      </div>
      {WEEKDAY_LABELS.map((day, i) => {
        const dow = i + 1;
        return (
          <div key={dow} className="hm-row">
            <div className="hm-day">{day}</div>
            {hours.map((h) => {
              const v = data[dow]?.[h] || 0;
              const intensity = v / max;
              const clickable = v > 0 && !!onCellClick;
              return (
                <button
                  key={h}
                  type="button"
                  className="hm-cell"
                  title={`${day} ${String(h).padStart(2, '0')}:00 · ${v} booking${clickable ? ' (คลิกดูรายการ)' : ''}`}
                  disabled={!clickable}
                  onClick={() => clickable && onCellClick(dow, h)}
                  style={{
                    background:
                      v === 0
                        ? 'var(--bg-2)'
                        : `oklch(${0.92 - 0.5 * intensity} ${0.08 + 0.12 * intensity} 45)`,
                    color: intensity > 0.5 ? '#fff' : 'var(--fg-2)',
                    cursor: clickable ? 'pointer' : 'default',
                    border: 0,
                    font: 'inherit',
                  }}
                >
                  {v > 0 ? v : ''}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ──────────── Horizontal bar chart (location split) ────────────
function BarChart({ data, onRowClick }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  if (total === 0) return <div className="chart-empty">ไม่มีข้อมูล</div>;
  const max = Math.max(...data.map((d) => d.value));
  return (
    <div className="hbar-wrap">
      {data.map((d, i) => (
        <button
          key={d.label}
          type="button"
          className="hbar-row clickable"
          onClick={() => onRowClick?.(d.label)}
          disabled={!onRowClick}
        >
          <div className="hbar-label">{d.label}</div>
          <div className="hbar-track">
            <div
              className="hbar-fill"
              style={{
                width: `${(d.value / max) * 100}%`,
                background: PIE_COLORS[i % PIE_COLORS.length],
              }}
            />
          </div>
          <div className="hbar-count mono">
            {d.value}{' '}
            <span className="hbar-pct">({((d.value / total) * 100).toFixed(0)}%)</span>
          </div>
        </button>
      ))}
    </div>
  );
}

// ──────────── Horizontal bar (compact, for top-N lists with names) ────────────
function TopNBar({ data, accentColor = 'var(--accent)', suffix = '', onRowClick }) {
  if (!data.length) return <div className="chart-empty">ไม่มีข้อมูล</div>;
  const max = Math.max(...data.map((d) => d.value));
  return (
    <div className="topn-list">
      {data.map((d, i) => (
        <button
          key={d.label + i}
          type="button"
          className="topn-row clickable"
          onClick={() => onRowClick?.(d.label)}
          disabled={!onRowClick}
        >
          <div className="topn-rank mono">#{i + 1}</div>
          <div className="topn-info">
            <div className="topn-label">{d.label}</div>
            {d.sub && <div className="topn-sub">{d.sub}</div>}
          </div>
          <div className="topn-bar-wrap">
            <div
              className="topn-bar"
              style={{
                width: `${(d.value / max) * 100}%`,
                background: accentColor,
              }}
            />
            <span className="topn-value mono">
              {typeof d.value === 'number' ? d.value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : d.value}
              {suffix && <span className="topn-value-suffix">{suffix}</span>}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

// ──────────── Drill-down drawer ────────────
// Any chart element click → this drawer opens with the matching bookings list
function DrillDownDrawer({ drillDown, bookings, roomMap, empByName, onClose }) {
  if (!drillDown) return null;
  return (
    <div className="cal-drawer-backdrop" onClick={onClose}>
      <aside className="cal-drawer" onClick={(e) => e.stopPropagation()}>
        <header className="cal-drawer-head">
          <div>
            <h2>{drillDown.label}</h2>
            <div className="cal-drawer-sub">{bookings.length.toLocaleString()} การจอง</div>
          </div>
          <button className="cal-drawer-close" onClick={onClose} aria-label="ปิด">✕</button>
        </header>
        {bookings.length === 0 ? (
          <div className="view-empty" style={{ margin: 16 }}>ไม่มีการจองในหมวดนี้</div>
        ) : (
          <div className="cal-drawer-list">
            {bookings.map((b) => {
              const room = roomMap[b.roomId];
              const emp = empByName[b.booker];
              return (
                <div key={b.id} className="cal-drawer-item" style={{ cursor: 'default' }}>
                  <div className="cdi-time mono">
                    {fmtTimeColon(b.start)}<br />
                    <span>{fmtTimeColon(b.end)}</span>
                  </div>
                  <div className="cdi-bar" />
                  <div className="cdi-main">
                    <div className="cdi-title">
                      {b.title}
                      <span className="cdi-date mono">
                        {' '}· {b.bookingDate}
                      </span>
                    </div>
                    <div className="cdi-room">
                      {room?.name || b.roomId}
                      <span className="cdi-room-meta">
                        {' · '}{room?.location}{room?.floor ? ` · ${room.floor}` : ''}
                      </span>
                    </div>
                    <div className="cdi-chips">
                      {emp ? (
                        <span className="cdi-chip">
                          👤 {emp.name} {emp.nickname && `(${emp.nickname})`} · {emp.dept}
                        </span>
                      ) : (
                        <span className="cdi-chip">👤 {b.booker || '—'}</span>
                      )}
                      {b.purpose && <span className="cdi-chip">🎯 {b.purpose}</span>}
                      {b.attendees > 0 && <span className="cdi-chip">👥 {b.attendees}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}

// ──────────── Main view ────────────
export default function DashboardView({ rooms = [], employees = [] }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drillDown, setDrillDown] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchAllBookings();
        setBookings(data);
      } catch (err) {
        setError(err.message || String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const roomMap = useMemo(
    () => Object.fromEntries(rooms.map((r) => [r.id, r])),
    [rooms]
  );
  const empByName = useMemo(
    () => Object.fromEntries(employees.map((e) => [e.name, e])),
    [employees]
  );

  const analytics = useMemo(() => {
    const now = new Date();
    const thisM = monthKey(now);
    const lastMDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastM = monthKey(lastMDate);

    // Aggregations
    const byMonth = {};                         // 'YYYY-MM' → { count, hours, bookers:Set }
    const byPurpose = {};
    const byLocation = {};
    const byRoom = {};                          // room_id → { count, hours }
    const byDept = {};                          // dept → { count, hours }
    const byBooker = {};                        // booker name → { count, hours, dept }
    const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
    const dailyThisMonth = new Array(31).fill(0); // 1..31 day index (slot 0 unused)
    const allBookers = new Set();
    let totalMins = 0;
    let firstDate = null;
    let lastDate = null;

    for (const b of bookings) {
      const mk = b.bookingDate.slice(0, 7);
      if (!byMonth[mk]) byMonth[mk] = { count: 0, hours: 0, bookers: new Set() };
      byMonth[mk].count++;
      const mins = b.end - b.start;
      byMonth[mk].hours += mins / 60;
      totalMins += mins;
      if (b.booker) {
        byMonth[mk].bookers.add(b.booker);
        allBookers.add(b.booker);
      }
      if (!firstDate || b.bookingDate < firstDate) firstDate = b.bookingDate;
      if (!lastDate || b.bookingDate > lastDate) lastDate = b.bookingDate;

      const p = b.purpose || 'ไม่ระบุ';
      byPurpose[p] = (byPurpose[p] || 0) + 1;

      const loc = roomMap[b.roomId]?.location || 'ไม่ระบุ';
      byLocation[loc] = (byLocation[loc] || 0) + 1;

      // Per-room aggregation
      if (b.roomId) {
        if (!byRoom[b.roomId]) byRoom[b.roomId] = { count: 0, hours: 0 };
        byRoom[b.roomId].count++;
        byRoom[b.roomId].hours += mins / 60;
      }

      // Department + booker aggregation — only when booker resolves to an
      // employee in the roster. Historical imports with non-matching names
      // are skipped so dept/booker charts reflect real data.
      const emp = b.booker ? empByName[b.booker] : null;
      if (emp) {
        const dept = emp.dept || 'ไม่ระบุแผนก';
        if (!byDept[dept]) byDept[dept] = { count: 0, hours: 0 };
        byDept[dept].count++;
        byDept[dept].hours += mins / 60;

        if (!byBooker[b.booker]) {
          byBooker[b.booker] = { count: 0, hours: 0, dept: emp.dept, nickname: emp.nickname };
        }
        byBooker[b.booker].count++;
        byBooker[b.booker].hours += mins / 60;
      }

      const d = new Date(b.bookingDate + 'T00:00:00');
      const dow = d.getDay();
      const sh = Math.floor(b.start / 60);
      const eh = Math.ceil(b.end / 60);
      for (let h = sh; h < eh; h++) {
        if (h >= 0 && h < 24) heat[dow][h]++;
      }

      // Daily count for current month
      if (mk === thisM) {
        dailyThisMonth[d.getDate()]++;
      }
    }

    // Overall KPIs
    const firstMonthObj = firstDate ? new Date(firstDate + 'T00:00:00') : now;
    const lastMonthObj = lastDate ? new Date(lastDate + 'T00:00:00') : now;
    const monthsCovered =
      (lastMonthObj.getFullYear() - firstMonthObj.getFullYear()) * 12 +
      (lastMonthObj.getMonth() - firstMonthObj.getMonth()) + 1;
    const overall = {
      totalBookings: bookings.length,
      totalHours: totalMins / 60,
      totalUsers: allBookers.size,
      avgPerMonth: monthsCovered > 0 ? bookings.length / monthsCovered : 0,
      firstDate,
      lastDate,
    };

    // This-month KPIs (with MoM delta)
    const kpis = {
      bookingsThis: byMonth[thisM]?.count || 0,
      bookingsLast: byMonth[lastM]?.count || 0,
      hoursThis: byMonth[thisM]?.hours || 0,
      hoursLast: byMonth[lastM]?.hours || 0,
      usersThis: byMonth[thisM]?.bookers.size || 0,
    };
    const pct = (curr, prev) =>
      prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100;
    kpis.bookingsDelta = pct(kpis.bookingsThis, kpis.bookingsLast);
    kpis.hoursDelta = pct(kpis.hoursThis, kpis.hoursLast);

    // Overall trend: every month between firstDate and lastDate (cap at 36 points for readability)
    const overallLine = [];
    if (firstDate && lastDate) {
      const start = new Date(firstMonthObj.getFullYear(), firstMonthObj.getMonth(), 1);
      const end = new Date(lastMonthObj.getFullYear(), lastMonthObj.getMonth(), 1);
      const cursor = new Date(start);
      while (cursor <= end) {
        const k = monthKey(cursor);
        overallLine.push({
          key: k,
          label: `${THAI_MONTHS_SHORT[cursor.getMonth()]}${String(cursor.getFullYear() + 543).slice(-2)}`,
          value: byMonth[k]?.count || 0,
        });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    // This-month daily trend (1..last day of current month)
    const daysInThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dailyData = [];
    for (let d = 1; d <= daysInThisMonth; d++) {
      dailyData.push({
        key: `${thisM}-${String(d).padStart(2, '0')}`,
        label: String(d),
        value: dailyThisMonth[d] || 0,
      });
    }

    // Top N purposes, group rest as "อื่นๆ"
    const purposeEntries = Object.entries(byPurpose).sort((a, b) => b[1] - a[1]);
    const TOP_N = 6;
    const topPurpose = purposeEntries.slice(0, TOP_N).map(([label, value]) => ({ label, value }));
    const others = purposeEntries.slice(TOP_N).reduce((acc, [, v]) => acc + v, 0);
    if (others > 0) {
      topPurpose.push({ label: `อื่นๆ (${purposeEntries.length - TOP_N})`, value: others });
    }

    const locationData = Object.entries(byLocation)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);

    // Top 10 departments by count / by hours
    const topDeptByCount = Object.entries(byDept)
      .map(([label, v]) => ({ label, value: v.count, sub: `${v.hours.toFixed(0)} ชม.` }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    const topDeptByHours = Object.entries(byDept)
      .map(([label, v]) => ({ label, value: Math.round(v.hours), sub: `${v.count} booking` }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // Top 10 bookers
    const topBookers = Object.entries(byBooker)
      .map(([name, v]) => ({
        label: name + (v.nickname ? ` (${v.nickname})` : ''),
        sub: v.dept || '—',
        value: v.count,
        hours: v.hours,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // Top 10 rooms — by hours desc (surface rooms that consume the most time)
    const topRooms = Object.entries(byRoom)
      .map(([id, v]) => ({ room: roomMap[id], count: v.count, hours: v.hours }))
      .filter((r) => r.room)
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10);

    const thisMonthLabel = `${THAI_MONTHS_SHORT[now.getMonth()]} ${now.getFullYear() + 543}`;

    return {
      overall,
      kpis,
      overallLine,
      dailyData,
      topPurpose,
      locationData,
      topDeptByCount,
      topDeptByHours,
      topBookers,
      topRooms,
      heat,
      thisMonthLabel,
    };
  }, [bookings, roomMap, empByName]);

  // Filter bookings to match the drill-down selection.
  // Must be declared BEFORE the early returns below to keep hook order stable.
  const drillBookings = useMemo(() => {
    if (!drillDown) return [];
    const top6 = (analytics?.topPurpose || []).slice(0, 6).map((p) => p.label);
    const topPurposeLabels = new Set(top6);
    return bookings
      .filter((b) => {
        switch (drillDown.type) {
          case 'heatmap': {
            const d = new Date(b.bookingDate + 'T00:00:00');
            if (d.getDay() !== drillDown.dow) return false;
            const sh = Math.floor(b.start / 60);
            const eh = Math.ceil(b.end / 60);
            return sh <= drillDown.hour && eh > drillDown.hour;
          }
          case 'purpose':
            return (b.purpose || 'ไม่ระบุ') === drillDown.value;
          case 'purpose-others': {
            const p = b.purpose || 'ไม่ระบุ';
            return !topPurposeLabels.has(p);
          }
          case 'location':
            return (roomMap[b.roomId]?.location || 'ไม่ระบุ') === drillDown.value;
          case 'dept': {
            const emp = empByName[b.booker];
            return !!emp && (emp.dept || 'ไม่ระบุแผนก') === drillDown.value;
          }
          case 'room':
            return b.roomId === drillDown.value;
          default:
            return false;
        }
      })
      .sort((a, b) => {
        if (a.bookingDate !== b.bookingDate)
          return a.bookingDate < b.bookingDate ? 1 : -1;
        return b.start - a.start;
      });
  }, [drillDown, bookings, roomMap, empByName, analytics]);

  if (loading) {
    return (
      <div className="dashboard">
        <h1 className="view-title">Dashboard ห้องประชุม</h1>
        <div className="view-subtitle">กำลังโหลดข้อมูล…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="dashboard">
        <h1 className="view-title">Dashboard ห้องประชุม</h1>
        <div className="view-error">โหลดข้อมูลไม่สำเร็จ: {error}</div>
      </div>
    );
  }

  const {
    overall,
    kpis,
    dailyData,
    topPurpose,
    locationData,
    topDeptByCount,
    topDeptByHours,
    topRooms,
    heat,
    thisMonthLabel,
  } = analytics;

  const handlePurposeClick = (label) => {
    if (label.startsWith('อื่นๆ')) {
      setDrillDown({ type: 'purpose-others', label: 'วัตถุประสงค์อื่นๆ (นอก Top 6)' });
    } else {
      setDrillDown({ type: 'purpose', value: label, label: `วัตถุประสงค์: ${label}` });
    }
  };
  const handleLocationClick = (label) =>
    setDrillDown({ type: 'location', value: label, label: `สถานที่: ${label}` });
  const handleDeptClick = (label) =>
    setDrillDown({ type: 'dept', value: label, label: `แผนก: ${label}` });
  const handleHeatmapClick = (dow, hour) => {
    const dayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    setDrillDown({
      type: 'heatmap',
      dow,
      hour,
      label: `วัน${dayNames[dow]} · ${String(hour).padStart(2, '0')}:00`,
    });
  };
  const handleRoomClick = (room) =>
    setDrillDown({ type: 'room', value: room.id, label: `ห้อง: ${room.name} (${room.id})` });

  return (
    <div className="dashboard">
      <div className="dashboard-head">
        <div>
          <h1 className="view-title">Dashboard ห้องประชุม</h1>
          <div className="view-subtitle">
            ช่วงข้อมูล {overall.firstDate || '—'} ถึง {overall.lastDate || '—'}
          </div>
        </div>
      </div>

      <h2 className="dashboard-section-h">ภาพรวมทั้งหมด</h2>
      <div className="kpi-grid">
        <Kpi
          label="การจองทั้งหมด"
          value={overall.totalBookings.toLocaleString()}
          sub="รายการ"
        />
        <Kpi
          label="ชั่วโมงรวมทั้งหมด"
          value={overall.totalHours.toFixed(0).toString()}
          sub="ชั่วโมง"
        />
        <Kpi
          label="ผู้ใช้งานไม่ซ้ำ"
          value={overall.totalUsers.toLocaleString()}
          sub="คน"
        />
        <Kpi
          label="เฉลี่ย/เดือน"
          value={overall.avgPerMonth.toFixed(0)}
          sub="รายการ"
        />
      </div>

      <h2 className="dashboard-section-h">เดือนนี้ ({thisMonthLabel})</h2>
      <div className="kpi-grid">
        <Kpi
          label="การจองเดือนนี้"
          value={kpis.bookingsThis.toLocaleString()}
          delta={kpis.bookingsDelta}
        />
        <Kpi
          label="ชั่วโมงรวมเดือนนี้"
          value={`${kpis.hoursThis.toFixed(0)} ชม.`}
          delta={kpis.hoursDelta}
        />
        <Kpi
          label="ผู้ใช้งานไม่ซ้ำเดือนนี้"
          value={kpis.usersThis.toLocaleString()}
          sub="คน"
        />
        <Kpi
          label="เดือนก่อน"
          value={kpis.bookingsLast.toLocaleString()}
          sub={`${kpis.hoursLast.toFixed(0)} ชั่วโมง`}
        />
      </div>

      <div className="charts-grid">
        <section className="chart-card chart-card-wide">
          <header className="chart-head">
            <h2>แนวโน้มเดือนนี้ (รายวัน)</h2>
            <div className="chart-sub">
              วันที่ 1 ถึง {dailyData.length} ของเดือน{thisMonthLabel}
            </div>
          </header>
          <VerticalBarChart data={dailyData} />
        </section>

        <section className="chart-card">
          <header className="chart-head">
            <h2>สัดส่วนวัตถุประสงค์</h2>
            <div className="chart-sub">ประเภทการใช้ห้องประชุม</div>
          </header>
          <PieChart data={topPurpose} onSliceClick={handlePurposeClick} />
        </section>

        <section className="chart-card">
          <header className="chart-head">
            <h2>สัดส่วนตามสถานที่</h2>
            <div className="chart-sub">Comets HQ / ICT / Phone Booth</div>
          </header>
          <BarChart data={locationData} onRowClick={handleLocationClick} />
        </section>

        <section className="chart-card chart-card-wide">
          <header className="chart-head">
            <h2>Peak time: วัน × ชั่วโมง (จันทร์–ศุกร์)</h2>
            <div className="chart-sub">
              แต่ละช่อง = จำนวน booking ที่ใช้ห้องในชั่วโมงนั้น · สีเข้ม = จองบ่อย
            </div>
          </header>
          <Heatmap data={heat} onCellClick={handleHeatmapClick} />
        </section>
      </div>

      <h2 className="dashboard-section-h">วิเคราะห์ระดับแผนก · ระดับผู้ใช้</h2>
      <div className="charts-grid">
        <section className="chart-card">
          <header className="chart-head">
            <h2>Top 10 แผนกที่จองมากสุด</h2>
            <div className="chart-sub">นับจำนวน booking · ใต้เลขแสดงชั่วโมงรวม</div>
          </header>
          <TopNBar
            data={topDeptByCount}
            accentColor="var(--accent)"
            suffix=" ครั้ง"
            onRowClick={handleDeptClick}
          />
        </section>

        <section className="chart-card">
          <header className="chart-head">
            <h2>Top 10 แผนกที่ใช้ชั่วโมงเยอะสุด</h2>
            <div className="chart-sub">ชั่วโมงรวม · ใต้เลขแสดงจำนวน booking</div>
          </header>
          <TopNBar
            data={topDeptByHours}
            accentColor="oklch(0.68 0.15 220)"
            suffix=" ชม."
            onRowClick={handleDeptClick}
          />
        </section>
      </div>

      <h2 className="dashboard-section-h">วิเคราะห์ระดับห้อง</h2>
      <div className="charts-grid">
        <section className="chart-card chart-card-wide">
          <header className="chart-head">
            <h2>Top 10 ห้องที่ถูกใช้บ่อยสุด</h2>
            <div className="chart-sub">
              เรียงตาม ชั่วโมงรวม · แสดง จำนวน booking ควบคู่
            </div>
          </header>
          {topRooms.length === 0 ? (
            <div className="chart-empty">ไม่มีข้อมูล</div>
          ) : (
            <table className="room-rank-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>ห้อง</th>
                  <th style={{ width: 90, textAlign: 'right' }}>ชั่วโมง</th>
                  <th style={{ width: 90, textAlign: 'right' }}>ครั้ง</th>
                </tr>
              </thead>
              <tbody>
                {topRooms.map((r, i) => (
                  <tr
                    key={r.room.id}
                    className="rr-clickable"
                    onClick={() => handleRoomClick(r.room)}
                  >
                    <td className="rr-rank mono">#{i + 1}</td>
                    <td>
                      <div className="rr-cell">
                        <div
                          className="rr-photo"
                          style={{ backgroundImage: `url(${r.room.picture})` }}
                        />
                        <div className="rr-info">
                          <div className="rr-name">{r.room.name}</div>
                          <div className="rr-meta">
                            <span className="mono">{r.room.id}</span>
                            {' · '}
                            {r.room.location}
                            {r.room.floor && ` · ${r.room.floor}`}
                            {' · '}
                            {r.room.seats} ที่นั่ง
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="rr-val mono">{r.hours.toFixed(0)}</td>
                    <td className="rr-val mono">{r.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <DrillDownDrawer
        drillDown={drillDown}
        bookings={drillBookings}
        roomMap={roomMap}
        empByName={empByName}
        onClose={() => setDrillDown(null)}
      />
    </div>
  );
}
