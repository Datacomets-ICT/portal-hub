// Admin calendar — looks like a real wall calendar (month grid).
// Clicking a day drills into a day-timeline (cars × hours).
// Loads bookings via drv_get_all_bookings.

const { useState: uSCal, useEffect: uECal } = React;

const HOUR_START_DEFAULT = 6;
const HOUR_END_DEFAULT   = 21;

const STATUS_COLORS = {
  pending:   { bg:"#FEF3C7", bd:"#F59E0B", fg:"#92400E", label:"รออนุมัติ" },
  approved:  { bg:"#DBEAFE", bd:"#2563EB", fg:"#1E3A8A", label:"อนุมัติแล้ว" },
  completed: { bg:"#DCFCE7", bd:"#16A34A", fg:"#14532D", label:"เสร็จสิ้น" },
};

const CalendarScreen = ({ setPage, empId, password }) => {
  const [bookings, setBookings] = uSCal([]);
  const [loading, setLoading]   = uSCal(true);
  const [error, setError]       = uSCal('');
  const [view, setView]         = uSCal('month');                                 // month | list | timeline
  const [day, setDay]           = uSCal(() => new Date().toISOString().slice(0, 10));

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

  const today = () => setDay(new Date().toISOString().slice(0, 10));
  const shiftMonth = (delta) => {
    const d = parseISOLocal(day);
    d.setDate(1);
    d.setMonth(d.getMonth() + delta);
    setDay(d.toISOString().slice(0, 10));
  };
  const shiftDay = (delta) => {
    const d = parseISOLocal(day);
    d.setDate(d.getDate() + delta);
    setDay(d.toISOString().slice(0, 10));
  };

  const monthLabel = (() => {
    const d = parseISOLocal(day);
    return d.toLocaleDateString('th-TH', { month:'long', year:'numeric' });
  })();
  const dayLabel = (() => {
    const d = parseISOLocal(day);
    return d.toLocaleDateString('th-TH', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  })();

  return (
    <div>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-end", flexWrap:"wrap", gap:16, marginBottom:18}}>
        <div>
          <h1 style={{margin:0, fontSize:26, letterSpacing:"-.01em"}}>ปฏิทินการใช้รถ</h1>
          <p style={{margin:"4px 0 0", color:"var(--ink-3)", fontSize:14}}>คลิกที่วันใดก็ได้เพื่อดูรายละเอียด — เห็นภาพรวมการใช้รถทั้งเดือน</p>
        </div>
        <div style={{display:"flex", gap:8, alignItems:"center", flexWrap:"wrap"}}>
          {view === "month" ? (
            <>
              <button onClick={()=>shiftMonth(-1)} style={navBtnStyle}>‹ เดือนก่อน</button>
              <button onClick={today} style={{...navBtnStyle, background:"var(--blue-50)", color:"var(--blue-700)", borderColor:"var(--blue-200)"}}>วันนี้</button>
              <button onClick={()=>shiftMonth(1)} style={navBtnStyle}>เดือนถัดไป ›</button>
            </>
          ) : (
            <>
              <button onClick={()=>shiftDay(-1)} style={navBtnStyle}>‹ ก่อนหน้า</button>
              <button onClick={today} style={{...navBtnStyle, background:"var(--blue-50)", color:"var(--blue-700)", borderColor:"var(--blue-200)"}}>วันนี้</button>
              <button onClick={()=>shiftDay(1)} style={navBtnStyle}>ถัดไป ›</button>
            </>
          )}
          <input type="date" value={day} onChange={e=>setDay(e.target.value)}
            style={{padding:"7px 10px", border:"1px solid var(--line)", borderRadius:8, fontFamily:"inherit", fontSize:13}}/>
          <Btn variant="ghost" onClick={reload} icon={<Ico.Plus/>}>รีเฟรช</Btn>
        </div>
      </div>

      <div style={{display:"flex", gap:6, padding:4, background:"#fff", border:"1px solid var(--line)", borderRadius:12, marginBottom:14, width:"fit-content"}}>
        {[
          ['month',    '📅 เดือน'],
          ['list',     '📋 รายการรายวัน'],
          ['timeline', '🕐 ตารางรถ'],
        ].map(([k,l]) => (
          <button key={k} onClick={()=>setView(k)} style={{
            padding:"6px 14px", border:"none", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:"inherit",
            background: view===k?"var(--blue-600)":"transparent", color: view===k?"#fff":"var(--ink-2)",
          }}>{l}</button>
        ))}
      </div>

      <div style={{fontSize:13, color:"var(--ink-3)", marginBottom:10}}>
        {view === "month" ? monthLabel : dayLabel}
      </div>

      {error ? (
        <div style={{padding:"12px 16px", borderRadius:10, background:"#FEE2E2", border:"1px solid #FCA5A5", color:"#991B1B", fontSize:13, fontWeight:500, marginBottom:14}}>
          ⚠️ {error}
        </div>
      ) : null}

      {loading ? (
        <Card style={{padding:40, textAlign:"center", color:"var(--ink-3)"}}>กำลังโหลด…</Card>
      ) : view === "month" ? (
        <MonthGrid day={day} bookings={bookings} onPickDay={(d)=>{ setDay(d); setView("list"); }}/>
      ) : view === "timeline" ? (
        <DayTimeline day={day} bookings={bookings}
          onClickBooking={(b) => setPage({name:"admin", openBookingKey: b.key})}/>
      ) : (
        <DayList day={day} bookings={bookings}
          onClickBooking={(b) => setPage({name:"admin", openBookingKey: b.key})}/>
      )}

      <div style={{marginTop:14, display:"flex", gap:14, fontSize:12, color:"var(--ink-3)", flexWrap:"wrap"}}>
        <LegendDot color={STATUS_COLORS.pending.bg}   border={STATUS_COLORS.pending.bd}   label="รออนุมัติ"/>
        <LegendDot color={STATUS_COLORS.approved.bg}  border={STATUS_COLORS.approved.bd}  label="อนุมัติแล้ว"/>
        <LegendDot color={STATUS_COLORS.completed.bg} border={STATUS_COLORS.completed.bd} label="เสร็จสิ้น"/>
      </div>
    </div>
  );
};

// ============================================================
// Month grid (the "real calendar")
// ============================================================
const MonthGrid = ({ day, bookings, onPickDay }) => {
  const cur = parseISOLocal(day);
  const year = cur.getFullYear();
  const month = cur.getMonth();
  const todayStr = new Date().toISOString().slice(0, 10);

  // Build a 6-row × 7-col grid that always starts on Sunday and covers
  // the whole selected month + spillover.
  const firstOfMonth = new Date(year, month, 1);
  const startSunday  = new Date(firstOfMonth);
  startSunday.setDate(1 - firstOfMonth.getDay());
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(startSunday);
    d.setDate(startSunday.getDate() + i);
    cells.push(d);
  }

  // Index bookings by date string for fast lookup
  const byDate = {};
  bookings.forEach(b => {
    if (b.status === 'cancelled' || b.status === 'rejected') return;
    if (!b.date) return;
    if (!byDate[b.date]) byDate[b.date] = [];
    byDate[b.date].push(b);
  });

  const dayHeaders = ['อา','จ','อ','พ','พฤ','ศ','ส'];

  return (
    <Card style={{padding:0, overflow:"hidden"}}>
      <div style={{display:"grid", gridTemplateColumns:"repeat(7, 1fr)", borderBottom:"1px solid var(--line)", background:"var(--surface-2)"}}>
        {dayHeaders.map((h, i) => (
          <div key={i} style={{
            padding:"10px 12px", fontSize:12, fontWeight:700, color:"var(--ink-3)",
            textAlign:"center", letterSpacing:.5,
            borderLeft: i === 0 ? "none" : "1px solid var(--line-2)",
          }}>{h}</div>
        ))}
      </div>

      <div style={{display:"grid", gridTemplateColumns:"repeat(7, 1fr)"}}>
        {cells.map((d, idx) => {
          const ds = d.toISOString().slice(0, 10);
          const items = byDate[ds] || [];
          const isOtherMonth = d.getMonth() !== month;
          const isToday = ds === todayStr;
          return (
            <button key={idx} onClick={() => onPickDay(ds)} style={{
              minHeight:120, padding:"8px 8px 6px",
              borderLeft: idx % 7 === 0 ? "none" : "1px solid var(--line-2)",
              borderTop:  idx < 7 ? "none" : "1px solid var(--line-2)",
              background: isOtherMonth ? "var(--surface-2)" : "#fff",
              opacity: isOtherMonth ? 0.55 : 1,
              cursor:"pointer", fontFamily:"inherit", textAlign:"left",
              display:"flex", flexDirection:"column", gap:4,
              transition:"background .12s",
            }}
            onMouseEnter={e=>{e.currentTarget.style.background = isOtherMonth ? "var(--surface-2)" : "var(--blue-50)";}}
            onMouseLeave={e=>{e.currentTarget.style.background = isOtherMonth ? "var(--surface-2)" : "#fff";}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                <span style={{
                  display:"inline-grid", placeItems:"center",
                  width:isToday ? 26 : "auto", height:isToday ? 26 : "auto",
                  minWidth:24, padding: isToday ? 0 : "0 4px",
                  borderRadius: isToday ? "50%" : 4,
                  background: isToday ? "var(--blue-600)" : "transparent",
                  color: isToday ? "#fff" : (isOtherMonth ? "var(--muted)" : "var(--ink)"),
                  fontWeight:700, fontSize:13,
                }}>{d.getDate()}</span>
                {items.length > 0 ? (
                  <span style={{fontSize:11, color:"var(--ink-3)", fontWeight:600}}>{items.length} คำขอ</span>
                ) : null}
              </div>
              <div style={{display:"flex", flexDirection:"column", gap:3, marginTop:2}}>
                {items.slice(0, 3).map(b => {
                  const c = STATUS_COLORS[b.status] || STATUS_COLORS.pending;
                  return (
                    <div key={b.key} title={`${b.id} · ${b.timeOut}-${b.timeBack} · ${b.employee?.name || ''}`} style={{
                      background: c.bg, color: c.fg, borderLeft: `3px solid ${c.bd}`,
                      borderRadius:4, padding:"2px 6px",
                      fontSize:11, fontWeight:600, lineHeight:1.3,
                      whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                    }}>
                      <span className="mono">{b.timeOut}</span> · {b.employee?.name || b.employee?.id || '-'}
                    </div>
                  );
                })}
                {items.length > 3 ? (
                  <div style={{fontSize:11, color:"var(--blue-700)", fontWeight:600, padding:"0 6px"}}>+{items.length - 3} เพิ่มเติม</div>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
};

// ============================================================
// Day list — flat list of every booking on the selected day.
// This is the default drill-down when a user clicks a day cell.
// ============================================================
const DayList = ({ day, bookings, onClickBooking }) => {
  const ofDay = bookings
    .filter(b => b.date === day)
    .sort((a, b) => (a.timeOut || '').localeCompare(b.timeOut || ''));

  if (ofDay.length === 0) {
    return (
      <Card style={{padding:60, textAlign:"center", color:"var(--ink-3)"}}>
        <div style={{fontSize:32, marginBottom:8}}>📅</div>
        ไม่มีการจองในวันนี้
      </Card>
    );
  }

  // Tiny status pip used at the start of each row
  const pip = (status) => {
    const c = STATUS_COLORS[status] || { bd: '#9ca3af', label: 'อื่น ๆ' };
    const labelMap = { pending:'รออนุมัติ', approved:'อนุมัติแล้ว', completed:'เสร็จสิ้น', rejected:'ไม่อนุมัติ', cancelled:'ยกเลิก' };
    return { color: c.bd || '#9ca3af', label: labelMap[status] || status };
  };

  return (
    <div style={{display:"grid", gap:10}}>
      {ofDay.map(b => {
        const p = pip(b.status);
        return (
          <Card key={b.key} onClick={() => onClickBooking(b)}
            style={{padding:0, cursor:"pointer", overflow:"hidden", transition:"box-shadow .15s, border-color .15s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--blue-200)"; e.currentTarget.style.boxShadow="var(--shadow-md)";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--line)"; e.currentTarget.style.boxShadow="var(--shadow-sm)";}}>
            <div style={{display:"grid", gridTemplateColumns:"6px 86px 1fr auto auto", alignItems:"center", gap:14, padding:"14px 18px"}}>
              <div style={{alignSelf:"stretch", background: p.color, borderRadius:3}}/>
              <div style={{textAlign:"center"}}>
                <div className="mono" style={{fontSize:18, fontWeight:700, lineHeight:1.1}}>{b.timeOut}</div>
                <div className="mono" style={{fontSize:11, color:"var(--ink-3)"}}>กลับ {b.timeBack}</div>
              </div>
              <div style={{minWidth:0}}>
                <div style={{display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:4}}>
                  <b className="mono" style={{fontSize:12, color:"var(--ink-3)"}}>{b.id}</b>
                  <StatusBadge s={b.status}/>
                  {b.messagesCount ? <ChatChip count={b.messagesCount}/> : null}
                </div>
                <div style={{fontWeight:600, fontSize:14}}>{b.pickup?.name} → {b.dropoff?.name}</div>
                <div style={{fontSize:12, color:"var(--ink-3)", marginTop:3, display:"flex", gap:10, flexWrap:"wrap"}}>
                  <span><Ico.User style={{marginRight:3, verticalAlign:"-2px"}}/> {b.employee?.name} ({b.employee?.id})</span>
                  {b.purpose ? <span>· {b.purpose}</span> : null}
                </div>
              </div>
              <div style={{textAlign:"right", fontSize:12}}>
                {b.car ? (
                  <div>
                    <div className="mono" style={{fontWeight:700, color:"var(--ink-2)"}}>{b.car.plate}</div>
                    <div style={{color:"var(--ink-3)"}}>{b.driver?.name || '— ไม่มีคนขับ —'}</div>
                  </div>
                ) : (
                  <div style={{color:"var(--warn)", fontWeight:600}}>ยังไม่จัดสรร</div>
                )}
              </div>
              <div style={{color:"var(--muted)", fontSize:18}}><Ico.ArrowRight/></div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

const ChatChip = ({ count }) => (
  <span style={{
    display:"inline-flex", alignItems:"center", gap:4,
    padding:"2px 7px", borderRadius:999,
    background:"var(--surface-2)", color:"var(--ink-3)",
    border:"1px solid var(--line)", fontSize:11, fontWeight:600,
  }}>💬 {count}</span>
);

// ============================================================
// Day timeline (cars × hours) — shown when user clicks a day
// ============================================================
const DayTimeline = ({ day, bookings, onClickBooking }) => {
  const ofDay = bookings.filter(b =>
    b.date === day && b.status !== 'cancelled' && b.status !== 'rejected'
  );
  let hStart = HOUR_START_DEFAULT;
  let hEnd   = HOUR_END_DEFAULT;
  ofDay.forEach(b => {
    const s = parseHourFraction(b.timeOut);
    const e = parseHourFraction(b.timeBack);
    if (s < hStart) hStart = Math.floor(s);
    if (e > hEnd + 1) hEnd = Math.ceil(e) - 1;
  });
  hStart = Math.max(0, hStart);
  hEnd   = Math.min(23, hEnd);

  const carRows = (window.CARS || []).slice();
  const countByCar = {};
  ofDay.forEach(b => {
    const cid = b.car ? findCarIdByPlateLocal(b.car.plate) : null;
    if (cid) countByCar[cid] = (countByCar[cid] || 0) + 1;
  });
  carRows.sort((a, b) => (countByCar[b.id] || 0) - (countByCar[a.id] || 0));
  const unassigned = ofDay.filter(b => !b.car);

  const hours = [];
  for (let h = hStart; h <= hEnd; h++) hours.push(h);
  const colCount = hours.length;

  const assignedByCar = {};
  ofDay.forEach(b => {
    if (!b.car) return;
    const cid = findCarIdByPlateLocal(b.car.plate);
    if (!cid) return;
    if (!assignedByCar[cid]) assignedByCar[cid] = [];
    assignedByCar[cid].push(b);
  });

  return (
    <Card style={{padding:0, overflow:"hidden"}}>
      <div style={{overflowX:"auto"}}>
        <div style={{minWidth: colCount * 56 + 180}}>
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
                {hours.map((h, i) => <div key={i} style={{borderLeft:"1px solid var(--line-2)"}}/>)}
                <div style={{position:"absolute", top:7, bottom:7, left:180, right:0}}>
                  {items.map(b => (
                    <Bar key={b.key} b={b} onClick={() => onClickBooking(b)} hStart={hStart} hEnd={hEnd}/>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {unassigned.length > 0 ? (
        <div style={{padding:"14px 18px", background:"var(--warn-bg)", borderTop:"1px solid #f5dca0"}}>
          <div style={{fontSize:12, fontWeight:700, color:"var(--warn)", textTransform:"uppercase", letterSpacing:.5, marginBottom:8}}>
            ⚠️ ยังไม่จัดสรรรถ ({unassigned.length})
          </div>
          <div style={{display:"flex", flexWrap:"wrap", gap:8}}>
            {unassigned.map(b => (
              <button key={b.key} onClick={() => onClickBooking(b)} style={{
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
      ) : null}
      {ofDay.length === 0 ? (
        <div style={{padding:60, textAlign:"center", color:"var(--ink-3)"}}>
          <div style={{fontSize:32, marginBottom:8}}>📅</div>
          ไม่มีการจองในวันนี้
        </div>
      ) : null}
    </Card>
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
        position:"absolute", top:0, bottom:0, left: `${left}%`, width: `${widthPct}%`,
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

// ============================================================
// Helpers
// ============================================================
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

// "YYYY-MM-DD" → local Date (avoid timezone shifts from new Date(str))
function parseISOLocal(s) {
  if (!s) return new Date();
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

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
