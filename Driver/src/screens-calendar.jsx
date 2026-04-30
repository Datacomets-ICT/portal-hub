// Admin calendar / timeline — one row per car, time bars per booking.
// Loads bookings via drv_get_all_bookings (admin-only).
// Click a bar → opens the same admin detail panel as the list view.

const { useState: uSCal, useEffect: uECal } = React;

// Default visible window — extends automatically if any booking on the
// selected day starts earlier or ends later than this.
const HOUR_START_DEFAULT = 6;
const HOUR_END_DEFAULT   = 21;

const CalendarScreen = ({ setPage, empId, password }) => {
  const [bookings, setBookings] = uSCal([]);
  const [loading, setLoading]   = uSCal(true);
  const [error, setError]       = uSCal('');
  const [day, setDay]           = uSCal(() => new Date().toISOString().slice(0, 10));
  const [scope, setScope]       = uSCal('all');   // all | unassigned | assigned

  const reload = React.useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data, error: err } = await window.sb.rpc('drv_get_all_bookings', {
        p_emp_id: empId, p_password: password,
      });
      if (err) throw err;
      if (!data || !data.success) throw new Error(data?.message || 'โหลดไม่สำเร็จ');
      setBookings((data.bookings || []).map(rowToBooking));
    } catch (e) {
      setError(e.message || 'เกิดข้อผิดพลาด');
    } finally { setLoading(false); }
  }, [empId, password]);

  uECal(() => { reload(); }, [reload]);

  const ofDay = bookings.filter(b => b.date === day && b.status !== 'cancelled' && b.status !== 'rejected');
  const carRows = (window.CARS || []).slice();    // copy
  // sort cars by booking count today, busiest first
  const countByCar = {};
  ofDay.forEach(b => {
    const cid = b.car ? findCarIdByPlateLocal(b.car.plate) : null;
    if (cid) countByCar[cid] = (countByCar[cid] || 0) + 1;
  });
  carRows.sort((a, b) => (countByCar[b.id] || 0) - (countByCar[a.id] || 0));

  const unassigned = ofDay.filter(b => !b.car);

  const filtered = scope === 'unassigned' ? [] : carRows;
  const showUnassigned = scope !== 'assigned' && unassigned.length > 0;

  const shiftDay = (delta) => {
    const d = new Date(day + 'T00:00');
    d.setDate(d.getDate() + delta);
    setDay(d.toISOString().slice(0, 10));
  };
  const today = () => setDay(new Date().toISOString().slice(0, 10));

  const dayLabel = (() => {
    const d = new Date(day + 'T00:00');
    return d.toLocaleDateString('th-TH', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  })();

  return (
    <div>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-end", flexWrap:"wrap", gap:16, marginBottom:18}}>
        <div>
          <h1 style={{margin:0, fontSize:26, letterSpacing:"-.01em"}}>ปฏิทินการใช้รถ</h1>
          <p style={{margin:"4px 0 0", color:"var(--ink-3)", fontSize:14}}>เห็นภาพรวมว่ารถคันไหนถูกใช้ช่วงไหน คันไหนว่าง</p>
        </div>
        <div style={{display:"flex", gap:8, alignItems:"center", flexWrap:"wrap"}}>
          <button onClick={()=>shiftDay(-1)} style={navBtnStyle}>‹ ก่อนหน้า</button>
          <button onClick={today} style={{...navBtnStyle, background:"var(--blue-50)", color:"var(--blue-700)", borderColor:"var(--blue-200)"}}>วันนี้</button>
          <button onClick={()=>shiftDay(1)} style={navBtnStyle}>ถัดไป ›</button>
          <input type="date" value={day} onChange={e=>setDay(e.target.value)}
            style={{padding:"7px 10px", border:"1px solid var(--line)", borderRadius:8, fontFamily:"inherit", fontSize:13}}/>
          <Btn variant="ghost" onClick={reload} icon={<Ico.Plus/>}>รีเฟรช</Btn>
        </div>
      </div>

      <div style={{
        display:"flex", gap:6, padding:4, background:"#fff", border:"1px solid var(--line)",
        borderRadius:12, marginBottom:14, width:"fit-content",
      }}>
        {[
          ['all',         'ทุกอย่าง',         ofDay.length],
          ['assigned',    'ที่จัดสรรแล้ว',     ofDay.filter(b => b.car).length],
          ['unassigned',  'ยังไม่จัดสรร',      unassigned.length],
        ].map(([k,l,n]) => (
          <button key={k} onClick={()=>setScope(k)} style={{
            padding:"6px 12px", border:"none", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:"inherit",
            background: scope===k?"var(--blue-600)":"transparent", color: scope===k?"#fff":"var(--ink-2)",
            display:"inline-flex", alignItems:"center", gap:6,
          }}>
            {l}
            <span style={{
              background: scope===k?"rgba(255,255,255,.25)":"var(--line-2)",
              color: scope===k?"#fff":"var(--ink-3)",
              fontSize:11, padding:"1px 7px", borderRadius:999, fontWeight:700,
            }}>{n}</span>
          </button>
        ))}
      </div>

      <div style={{fontSize:13, color:"var(--ink-3)", marginBottom:10}}>{dayLabel}</div>

      {error ? (
        <div style={{padding:"12px 16px", borderRadius:10, background:"#FEE2E2", border:"1px solid #FCA5A5", color:"#991B1B", fontSize:13, fontWeight:500, marginBottom:14}}>
          ⚠️ {error}
        </div>
      ) : null}

      {loading ? (
        <Card style={{padding:40, textAlign:"center", color:"var(--ink-3)"}}>กำลังโหลด…</Card>
      ) : (
        <Card style={{padding:0, overflow:"hidden"}}>
          <TimelineGrid carRows={filtered} ofDay={ofDay}
            onClickBooking={(b) => setPage({name:"admin", openBookingKey: b.key})}/>
          {showUnassigned ? (
            <UnassignedSection items={unassigned}
              onClick={(b) => setPage({name:"admin", openBookingKey: b.key})}/>
          ) : null}
          {filtered.length === 0 && !showUnassigned ? (
            <div style={{padding:60, textAlign:"center", color:"var(--ink-3)"}}>
              <div style={{fontSize:32, marginBottom:8}}>📅</div>
              ไม่มีการจองในวันนี้
            </div>
          ) : null}
        </Card>
      )}

      <div style={{marginTop:14, display:"flex", gap:14, fontSize:12, color:"var(--ink-3)", flexWrap:"wrap"}}>
        <LegendDot color="#FEF3C7" border="#F59E0B" label="รออนุมัติ"/>
        <LegendDot color="#DBEAFE" border="#2563EB" label="อนุมัติแล้ว"/>
        <LegendDot color="#DCFCE7" border="#16A34A" label="เสร็จสิ้น"/>
      </div>
    </div>
  );
};

const navBtnStyle = {
  padding:"7px 12px", border:"1px solid var(--line)", background:"#fff", color:"var(--ink-2)",
  borderRadius:8, fontSize:13, fontWeight:600, fontFamily:"inherit", cursor:"pointer",
};

const LegendDot = ({ color, border, label }) => (
  <span style={{display:"inline-flex", alignItems:"center", gap:6}}>
    <span style={{width:14, height:14, borderRadius:3, background:color, border:`1px solid ${border}`}}/>
    {label}
  </span>
);

// Cars × hours grid. Each car row has hour columns; bookings are
// absolutely positioned bars within the row. Window auto-stretches to
// cover any booking that starts earlier than 06:00 or ends later than
// 22:00 so nothing gets clipped at the edge.
const TimelineGrid = ({ carRows, ofDay, onClickBooking }) => {
  let hStart = HOUR_START_DEFAULT;
  let hEnd   = HOUR_END_DEFAULT;
  ofDay.forEach(b => {
    const s = parseHourFraction(b.timeOut);
    const e = parseHourFraction(b.timeBack);
    if (s < hStart) hStart = Math.floor(s);
    if (e > hEnd + 1) hEnd = Math.ceil(e) - 1;        // hEnd is the LABEL of the last col; column covers hEnd → hEnd+1
  });
  hStart = Math.max(0, hStart);
  hEnd   = Math.min(23, hEnd);

  const hours = [];
  for (let h = hStart; h <= hEnd; h++) hours.push(h);
  const colCount = hours.length;
  const HOUR_START = hStart;
  const HOUR_END   = hEnd;

  const assignedByCar = {};
  ofDay.forEach(b => {
    if (!b.car) return;
    const cid = findCarIdByPlateLocal(b.car.plate);
    if (!cid) return;
    if (!assignedByCar[cid]) assignedByCar[cid] = [];
    assignedByCar[cid].push(b);
  });

  return (
    <div style={{overflowX:"auto"}}>
      <div style={{minWidth: colCount * 56 + 180}}>
        {/* Header row */}
        <div style={{display:"grid", gridTemplateColumns: `180px repeat(${colCount}, 1fr)`, borderBottom:"1px solid var(--line)", background:"var(--surface-2)"}}>
          <div style={{padding:"10px 14px", fontSize:11, fontWeight:700, color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:.5}}>รถ</div>
          {hours.map(h => (
            <div key={h} className="mono" style={{padding:"10px 0", fontSize:11, color:"var(--ink-3)", textAlign:"center", borderLeft:"1px solid var(--line-2)"}}>
              {String(h).padStart(2,'0')}
            </div>
          ))}
        </div>

        {carRows.map(c => {
          const items = assignedByCar[c.id] || [];
          return (
            <div key={c.id} style={{display:"grid", gridTemplateColumns: `180px repeat(${colCount}, 1fr)`, borderBottom:"1px solid var(--line-2)", position:"relative", minHeight:54}}>
              <div style={{padding:"10px 14px", borderRight:"1px solid var(--line-2)", display:"flex", flexDirection:"column", justifyContent:"center"}}>
                <div className="mono" style={{fontWeight:700, fontSize:13}}>{c.plate}</div>
                <div style={{fontSize:11, color:"var(--ink-3)"}}>{c.model || ''} · {c.seats || '?'} ที่นั่ง</div>
              </div>
              {hours.map((h, i) => (
                <div key={i} style={{borderLeft:"1px solid var(--line-2)"}}/>
              ))}
              {/* Booking bars positioned absolutely within the row */}
              <div style={{position:"absolute", top:7, bottom:7, left:180, right:0}}>
                {items.map(b => (
                  <Bar key={b.key} b={b} onClick={() => onClickBooking(b)}
                    hStart={HOUR_START} hEnd={HOUR_END}/>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Bar = ({ b, onClick, hStart, hEnd }) => {
  const start = parseHourFraction(b.timeOut);
  const end   = parseHourFraction(b.timeBack);
  const span  = hEnd - hStart + 1;
  const left  = Math.max(0, (start - hStart) / span * 100);
  const widthPct = Math.max(0, (Math.min(end, hEnd + 1) - Math.max(start, hStart)) / span * 100);
  if (widthPct <= 0) return null;
  const colors = STATUS_COLORS[b.status] || STATUS_COLORS.pending;
  return (
    <button onClick={onClick} title={`${b.id} · ${b.timeOut}-${b.timeBack} · ${b.employee?.name || ''} · ${b.purpose || ''}`}
      style={{
        position:"absolute", top:0, bottom:0,
        left: `${left}%`, width: `${widthPct}%`,
        background: colors.bg, border:`1px solid ${colors.bd}`, borderLeft:`4px solid ${colors.bd}`,
        borderRadius:6, padding:"4px 8px", overflow:"hidden",
        cursor:"pointer", textAlign:"left", fontFamily:"inherit",
        color: colors.fg, transition:"transform .12s",
      }}
      onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-1px)"; e.currentTarget.style.boxShadow="0 4px 8px rgba(0,0,0,.12)";}}
      onMouseLeave={e=>{e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow="";}}>
      <div style={{fontSize:11, fontWeight:700, lineHeight:1.2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>
        {b.timeOut}-{b.timeBack} · {b.employee?.name || b.employee?.id || '-'}
      </div>
      <div style={{fontSize:10, opacity:.85, lineHeight:1.2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>
        {b.pickup?.name} → {b.dropoff?.name}
      </div>
    </button>
  );
};

const STATUS_COLORS = {
  pending:   { bg:"#FEF3C7", bd:"#F59E0B", fg:"#92400E" },
  approved:  { bg:"#DBEAFE", bd:"#2563EB", fg:"#1E3A8A" },
  completed: { bg:"#DCFCE7", bd:"#16A34A", fg:"#14532D" },
};

const UnassignedSection = ({ items, onClick }) => (
  <div style={{padding:"14px 18px", background:"var(--warn-bg)", borderTop:"1px solid #f5dca0"}}>
    <div style={{fontSize:12, fontWeight:700, color:"var(--warn)", textTransform:"uppercase", letterSpacing:.5, marginBottom:8}}>
      ⚠️ ยังไม่จัดสรรรถ ({items.length})
    </div>
    <div style={{display:"flex", flexWrap:"wrap", gap:8}}>
      {items.map(b => (
        <button key={b.key} onClick={() => onClick(b)} style={{
          background:"#fff", border:"1px solid #f5dca0", borderRadius:8, padding:"8px 12px",
          fontSize:12, cursor:"pointer", fontFamily:"inherit", textAlign:"left",
        }}>
          <div className="mono" style={{fontWeight:700, color:"var(--warn)"}}>{b.id}</div>
          <div>{b.timeOut}-{b.timeBack} · {b.employee?.name || b.employee?.id}</div>
          <div style={{color:"var(--ink-3)"}}>{b.pickup?.name} → {b.dropoff?.name}</div>
        </button>
      ))}
    </div>
  </div>
);

function parseHourFraction(t) {
  if (!t) return 0;
  const [h, m] = String(t).split(':').map(Number);
  return (h || 0) + ((m || 0) / 60);
}

function findCarIdByPlateLocal(plate) {
  const c = (window.CARS || []).find(x => x.plate === plate);
  return c ? c.id : null;
}

Object.assign(window, { CalendarScreen });
