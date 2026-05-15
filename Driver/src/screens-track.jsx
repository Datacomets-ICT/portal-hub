// Track bookings list + detail
const { useState: uST } = React;

const TrackScreen = ({ setPage, empId, password, bookings, detailId, onReload, openChat }) => {
  const mine = bookings.filter(b => b.employee && b.employee.id === empId);
  const onEdit = (b) => setPage({name:"booking", editKey: b.key, editFrom: b});
  if (detailId) {
    const b = bookings.find(x => x.id === detailId);
    if (b) return <BookingDetail b={b} empId={empId} password={password} onReload={onReload} openChatInitial={!!openChat} onEdit={onEdit} back={()=>setPage({name:"track"})}/>;
  }

  const [filter, setFilter] = uST("all");
  const filtered = mine.filter(b => filter==="all" || b.status===filter);

  return (
    <div>
      <div style={{marginBottom:18}}>
        <button onClick={()=>setPage({name:"home"})} style={{background:"none", border:"none", cursor:"pointer", color:"var(--ink-3)", fontSize:13, display:"inline-flex", alignItems:"center", gap:4, padding:0, marginBottom:8}}>
          <Ico.ArrowLeft/> หน้าแรก
        </button>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-end", gap:20, flexWrap:"wrap"}}>
          <div>
            <h1 style={{margin:0, fontSize:26, letterSpacing:"-.01em"}}>ติดตามผลการจอง</h1>
            <p style={{margin:"4px 0 0", color:"var(--ink-3)", fontSize:14}}>รายการคำขอจองรถทั้งหมดของคุณ</p>
          </div>
          <Btn onClick={()=>setPage({name:"booking", step:0})} icon={<Ico.Plus/>}>จองเพิ่ม</Btn>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{display:"flex", gap:4, padding:4, background:"#fff", border:"1px solid var(--line)", borderRadius:12, marginBottom:16, width:"fit-content"}}>
        {[["all","ทั้งหมด",mine.length], ["pending","รออนุมัติ",mine.filter(b=>b.status==="pending").length], ["approved","อนุมัติแล้ว",mine.filter(b=>b.status==="approved").length], ["completed","เสร็จสิ้น",mine.filter(b=>b.status==="completed").length]].map(([k,l,n])=>(
          <button key={k} onClick={()=>setFilter(k)} style={{
            padding:"7px 14px", border:"none", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:"inherit",
            background: filter===k?"var(--blue-600)":"transparent", color: filter===k?"#fff":"var(--ink-2)",
            display:"inline-flex", alignItems:"center", gap:6,
          }}>
            {l}
            <span style={{
              background: filter===k?"rgba(255,255,255,.25)":"var(--line-2)",
              color: filter===k?"#fff":"var(--ink-3)",
              fontSize:11, padding:"1px 7px", borderRadius:999, fontWeight:700,
            }}>{n}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card style={{padding:60, textAlign:"center"}}>
          <div style={{fontSize:40, color:"var(--muted)", marginBottom:8}}><Ico.Route/></div>
          <div style={{fontWeight:600, marginBottom:4}}>ยังไม่มีการจองในหมวดนี้</div>
          <div style={{color:"var(--ink-3)", fontSize:13, marginBottom:16}}>เริ่มจองรถครั้งแรกได้เลย</div>
          <Btn onClick={()=>setPage({name:"booking", step:0})}>จองรถ</Btn>
        </Card>
      ) : (
        <div style={{display:"grid", gap:12}}>
          {filtered.map(b => <BookingCard key={b.id} b={b} onClick={()=>setPage({name:"track", id:b.id})}/>)}
        </div>
      )}
    </div>
  );
};

const BookingCard = ({ b, onClick }) => {
  const unread = bookingUnreadCount(b, 'user');
  return (
  <Card onClick={onClick} style={{padding:0, cursor:"pointer", overflow:"hidden", transition:"box-shadow .15s, border-color .15s", position:"relative"}}
    onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--blue-200)"; e.currentTarget.style.boxShadow="var(--shadow-md)";}}
    onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--line)"; e.currentTarget.style.boxShadow="var(--shadow-sm)";}}>
    <div style={{padding:"18px 22px", display:"grid", gridTemplateColumns:"auto 1fr auto auto", gap:18, alignItems:"center"}}>
      <div style={{width:52, height:52, borderRadius:12, background:"var(--blue-50)", display:"grid", placeItems:"center", fontSize:24}}>
        {b.job.icon}
      </div>
      <div style={{minWidth:0}}>
        <div style={{display:"flex", gap:10, alignItems:"center", marginBottom:4, flexWrap:"wrap"}}>
          <b className="mono" style={{fontSize:12, color:"var(--ink-3)"}}>{b.id}</b>
          <StatusBadge s={b.status}/>
        </div>
        <div style={{fontWeight:600, fontSize:15}}>{b.pickup.name} → {b.dropoff.name}</div>
        <div style={{fontSize:13, color:"var(--ink-3)", marginTop:3, display:"flex", gap:12, flexWrap:"wrap"}}>
          <span><Ico.Calendar style={{marginRight:4, verticalAlign:"-2px"}}/> {fmtDate(b.date)}</span>
          <span><Ico.Clock style={{marginRight:4, verticalAlign:"-2px"}}/> ออก {b.timeOut} · กลับ {b.timeBack}</span>
          <span>· {b.purpose}</span>
        </div>
      </div>
      <ChatPill messagesCount={b.messagesCount} unread={unread}/>
      <div style={{color:"var(--muted)", fontSize:20}}><Ico.ArrowRight/></div>
    </div>
  </Card>
  );
};

// Small chat indicator that appears on each booking card.
//   - If there are messages and any are unread → red 💬+N pill
//   - If there are messages but none unread → grey 💬 N pill
//   - No messages → nothing
const ChatPill = ({ messagesCount, unread }) => {
  if (!messagesCount) return <span/>;
  const hot = unread > 0;
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:5,
      padding:"4px 10px", borderRadius:999,
      background: hot ? "#fee2e2" : "var(--surface-2)",
      color:    hot ? "#b91c1c" : "var(--ink-3)",
      border:   hot ? "1px solid #fecaca" : "1px solid var(--line)",
      fontSize:12, fontWeight:600,
      animation: hot ? "pulseRing 2.4s infinite" : "none",
    }}>
      💬 {hot ? `+${unread}` : messagesCount}
    </span>
  );
};

const BookingDetail = ({ b, back, empId, password, onReload, openChatInitial, onEdit }) => {
  const [cancelling, setCancelling] = uST(false);
  const [chatOpen, setChatOpen]     = uST(!!openChatInitial);
  const cancel = async () => {
    const reason = window.prompt('เหตุผลในการยกเลิก (ไม่บังคับ):', '');
    if (reason === null) return;
    setCancelling(true);
    try {
      const { data, error } = await window.sb.rpc('drv_cancel_my_booking', {
        p_emp_id: empId, p_password: password,
        p_booking_key: b.key, p_reason: reason || null,
      });
      if (error) throw error;
      if (!data || !data.success) throw new Error(data?.message || 'ยกเลิกไม่สำเร็จ');
      onReload && await onReload();
      back();
    } catch (e) {
      alert(e.message || 'เกิดข้อผิดพลาด');
    } finally {
      setCancelling(false);
    }
  };
  return (
  <div>
    <button onClick={back} style={{background:"none", border:"none", cursor:"pointer", color:"var(--ink-3)", fontSize:13, display:"inline-flex", alignItems:"center", gap:4, padding:0, marginBottom:12}}>
      <Ico.ArrowLeft/> รายการทั้งหมด
    </button>

    <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18, flexWrap:"wrap", gap:12}}>
      <div>
        <div className="mono" style={{fontSize:13, color:"var(--ink-3)", fontWeight:600, marginBottom:4}}>{b.id}</div>
        <h1 style={{margin:0, fontSize:24, letterSpacing:"-.01em"}}>{b.pickup.name} → {b.dropoff.name}</h1>
        <div style={{color:"var(--ink-3)", fontSize:14, marginTop:4}}>ส่งคำขอเมื่อ {b.createdAt}</div>
      </div>
      <div style={{display:"flex", gap:10, alignItems:"center", flexWrap:"wrap"}}>
        <StatusBadge s={b.status}/>
        <button onClick={()=>setChatOpen(true)}
          style={{padding:"8px 14px", border:"1px solid var(--blue-600)", background:"var(--blue-50)", color:"var(--blue-700)",
                  borderRadius:8, fontSize:13, fontWeight:600, fontFamily:"inherit", cursor:"pointer",
                  display:"inline-flex", alignItems:"center", gap:6}}>
          💬 แชทกับ Admin
        </button>
        {b.status === 'pending' ? (
          <button onClick={()=>onEdit && onEdit(b)}
            style={{padding:"8px 14px", border:"1px solid var(--blue-600)", background:"#fff", color:"var(--blue-700)",
                    borderRadius:8, fontSize:13, fontWeight:600, fontFamily:"inherit", cursor:"pointer",
                    display:"inline-flex", alignItems:"center", gap:6}}>
            ✏️ แก้ไข
          </button>
        ) : null}
        {b.status === 'pending' ? (
          <button onClick={cancel} disabled={cancelling}
            style={{padding:"8px 14px", border:"1px solid var(--err)", background:"#fff", color:"var(--err)",
                    borderRadius:8, fontSize:13, fontWeight:600, fontFamily:"inherit", cursor:"pointer"}}>
            {cancelling ? 'กำลังยกเลิก…' : 'ยกเลิกการจอง'}
          </button>
        ) : null}
      </div>
    </div>
    {chatOpen ? (
      <BookingChat bookingKey={b.key} bookingNo={b.id} empId={empId} password={password} isAdmin={false} onClose={()=>setChatOpen(false)}/>
    ) : null}

    <div style={{display:"grid", gridTemplateColumns:"1fr 360px", gap:20}}>
      {/* Left */}
      <div style={{display:"flex", flexDirection:"column", gap:16}}>
        {/* Live trip panel — shows status buttons, GPS map, rating.
            Only renders once admin approved the booking. */}
        <LiveTripPanel b={b} empId={empId} onReload={onReload}/>

        {/* Timeline */}
        <Card style={{padding:24}}>
          <h3 style={{margin:"0 0 18px", fontSize:15}}>สถานะการดำเนินการ</h3>
          <div style={{position:"relative"}}>
            {b.timeline.map((t, i) => {
              const isLast = i === b.timeline.length-1;
              return (
                <div key={i} style={{display:"grid", gridTemplateColumns:"28px 1fr", gap:14, paddingBottom:isLast?0:18, position:"relative"}}>
                  {!isLast && <div style={{position:"absolute", left:13, top:26, bottom:0, width:2, background: t.done?"var(--blue-200)":"var(--line)"}}/>}
                  <div style={{
                    width:28, height:28, borderRadius:"50%",
                    background: t.done?"var(--blue-600)":"#fff",
                    border: "2px solid "+(t.done?"var(--blue-600)":"var(--line)"),
                    color:"#fff", display:"grid", placeItems:"center", fontSize:12, zIndex:1,
                  }}>
                    {t.done ? <Ico.Check/> : null}
                  </div>
                  <div style={{paddingTop:3}}>
                    <div style={{fontWeight:600, color: t.done?"var(--ink)":"var(--ink-3)"}}>{t.label}</div>
                    <div className="mono" style={{fontSize:11, color:"var(--ink-3)", marginTop:2}}>{t.at}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Route */}
        <Card style={{padding:24}}>
          <h3 style={{margin:"0 0 16px", fontSize:15}}>เส้นทาง</h3>
          <div style={{display:"flex", gap:14}}>
            <div style={{display:"flex", flexDirection:"column", alignItems:"center", paddingTop:4}}>
              <div style={{width:12, height:12, borderRadius:"50%", background:"var(--blue-600)"}}/>
              <div style={{width:2, flex:1, minHeight:40, background:"var(--blue-200)", margin:"4px 0"}}/>
              <div style={{width:12, height:12, borderRadius:"50%", background:"var(--blue-900)"}}/>
            </div>
            <div style={{flex:1}}>
              <div style={{marginBottom:18}}>
                <div style={{fontSize:11, color:"var(--ink-3)", fontWeight:600, letterSpacing:.4, textTransform:"uppercase"}}>จุดรับ · {b.timeOut}</div>
                <b style={{fontSize:15}}>{b.pickup.name}</b>
                <div style={{fontSize:13, color:"var(--ink-3)", marginTop:2}}>{b.pickup.detail}</div>
              </div>
              <div>
                <div style={{fontSize:11, color:"var(--ink-3)", fontWeight:600, letterSpacing:.4, textTransform:"uppercase"}}>จุดส่ง · {b.timeArrive}</div>
                <b style={{fontSize:15}}>{b.dropoff.name}</b>
                <div style={{fontSize:13, color:"var(--ink-3)", marginTop:2}}>{b.dropoff.detail}</div>
              </div>
            </div>
          </div>
          <div style={{marginTop:16}}><RouteMap origin={b.pickup.map} destination={b.dropoff.map} label="เส้นทาง"/></div>
        </Card>

        {/* Purpose */}
        <Card style={{padding:24}}>
          <h3 style={{margin:"0 0 10px", fontSize:15}}>วัตถุประสงค์</h3>
          <b>{b.purpose}</b>
          <p style={{margin:"6px 0 0", fontSize:14, color:"var(--ink-2)", lineHeight:1.6}}>{b.purposeDetail}</p>
        </Card>
      </div>

      {/* Right sidebar */}
      <div style={{display:"flex", flexDirection:"column", gap:16}}>
        <Card style={{padding:20}}>
          <h3 style={{margin:"0 0 14px", fontSize:14, color:"var(--ink-3)", fontWeight:600, letterSpacing:.4, textTransform:"uppercase"}}>ข้อมูลการเดินทาง</h3>
          <MiniRow k="ประเภทงาน" v={<span><span style={{marginRight:6}}>{b.job.icon}</span>{b.job.label}</span>}/>
          <MiniRow k="วันที่" v={fmtDate(b.date)}/>
          <MiniRow k="เวลาออก" v={b.timeOut}/>
          <MiniRow k="เวลาถึง" v={b.timeArrive}/>
          <MiniRow k="เวลากลับ" v={b.timeBack}/>
        </Card>

        <Card style={{padding:20}}>
          <h3 style={{margin:"0 0 14px", fontSize:14, color:"var(--ink-3)", fontWeight:600, letterSpacing:.4, textTransform:"uppercase"}}>ผู้จอง</h3>
          <div style={{display:"flex", alignItems:"center", gap:12}}>
            <div style={{width:42, height:42, borderRadius:"50%", background:"var(--blue-600)", color:"#fff", display:"grid", placeItems:"center", fontWeight:700, fontSize:16}}>
              {b.employee.name.charAt(0)}
            </div>
            <div>
              <b>{b.employee.name}</b>
              <div style={{fontSize:12, color:"var(--ink-3)"}}>{b.employee.dept}</div>
              <div className="mono" style={{fontSize:11, color:"var(--ink-3)"}}>{b.employee.phone}</div>
            </div>
          </div>
        </Card>

        {b.car || b.driver ? (
          <Card style={{padding:20, background:"var(--blue-50)", borderColor:"var(--blue-100)"}}>
            <h3 style={{margin:"0 0 14px", fontSize:14, color:"var(--blue-700)", fontWeight:600, letterSpacing:.4, textTransform:"uppercase"}}>รถและคนขับที่จัดสรร</h3>
            {b.car ? (
              <div style={{marginBottom: b.driver ? 14 : 0}}>
                <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:4}}>
                  <Ico.Car style={{color:"var(--blue-700)"}}/>
                  <b>{b.car.model || '-'}</b>
                </div>
                <div style={{fontSize:13, color:"var(--ink-2)"}}>
                  ทะเบียน <b className="mono">{b.car.plate}</b>
                  {b.car.seats ? ` · ${b.car.seats} ที่นั่ง` : ''}
                  {b.car.color ? ` · สี${b.car.color}` : ''}
                </div>
              </div>
            ) : null}
            {b.driver ? (
              <div style={{paddingTop: b.car ? 14 : 0, borderTop: b.car ? "1px solid var(--blue-100)" : "none"}}>
                <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:4}}>
                  <Ico.User style={{color:"var(--blue-700)"}}/>
                  <b>{b.driver.name}</b>
                </div>
                {b.driver.phone ? (
                  <div className="mono" style={{fontSize:12, color:"var(--ink-2)"}}>{b.driver.phone}</div>
                ) : null}
              </div>
            ) : null}
            {b.car && !b.driver ? (
              <div style={{marginTop:10, paddingTop:10, borderTop:"1px solid var(--blue-100)", fontSize:12, color:"var(--warn)"}}>
                ⚠️ ยังไม่ได้กำหนดคนขับ
              </div>
            ) : null}
            {!b.car && b.driver ? (
              <div style={{marginTop:10, fontSize:12, color:"var(--warn)"}}>
                ⚠️ ยังไม่ได้กำหนดรถ
              </div>
            ) : null}
          </Card>
        ) : (
          <Card style={{padding:20, background:"var(--warn-bg)", borderColor:"#f5dca0"}}>
            <div style={{fontSize:13, color:"var(--warn)", fontWeight:600, marginBottom:4}}>ยังไม่จัดสรรรถและคนขับ</div>
            <div style={{fontSize:12, color:"var(--ink-2)"}}>ระบบจะแจ้งเมื่อได้รับการอนุมัติและจัดสรรรถ</div>
          </Card>
        )}
      </div>
    </div>
  </div>
  );
};

const MiniRow = ({k, v}) => (
  <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", fontSize:13}}>
    <span style={{color:"var(--ink-3)"}}>{k}</span>
    <b style={{color:"var(--ink)"}}>{v}</b>
  </div>
);

// =============================================================================
// LiveTripPanel — Phase A (status buttons) + Phase B (GPS map) + Phase C (rating)
// =============================================================================
// Renders a single card with three sections that show / hide based on
// the trip's current state:
//   1. Status progress bar — 4 stages (ออกแล้ว → รับแล้ว → ส่งแล้ว → จบ)
//      with click-to-advance buttons for the driver/admin
//   2. Live GPS map (only while trip_status is on_the_way or picked_up)
//      — uses Leaflet for the rendering, free OpenStreetMap tiles
//   3. Star rating (only after trip_status='done', if not yet rated)
//
// State:
//   - Polls drv_get_my_bookings indirectly via parent's onReload every 6s
//     so the booker sees live updates without WebSocket plumbing.
//   - GPS share toggle uses navigator.geolocation.watchPosition; pings
//     drv_post_location every 30s while active.
const STATUS_FLOW = [
  { key: 'idle',       label: 'รอออก',     short: '⚪' },
  { key: 'on_the_way', label: 'ออกแล้ว',   short: '🚗' },
  { key: 'picked_up',  label: 'รับแล้ว',   short: '🙋' },
  { key: 'delivered',  label: 'ส่งแล้ว',   short: '📍' },
  { key: 'done',       label: 'จบ trip',   short: '✅' },
];

const LiveTripPanel = ({ b, empId, onReload }) => {
  const [busy, setBusy] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);
  const [loc, setLoc] = React.useState(null);
  const [shareErr, setShareErr] = React.useState('');
  const [rateValue, setRateValue] = React.useState(b.tripRating || 0);
  const [rateComment, setRateComment] = React.useState(b.tripRatingComment || '');
  const [rateSent, setRateSent] = React.useState(!!b.tripRating);
  const watchIdRef = React.useRef(null);
  const lastUploadRef = React.useRef(0);
  const mapElRef = React.useRef(null);
  const mapInstRef = React.useRef(null);
  const markerRef = React.useRef(null);

  const cur = b.tripStatus || 'idle';
  const curIdx = STATUS_FLOW.findIndex(s => s.key === cur);
  const isOwner = b.employee && b.employee.id === empId;
  const tripActive = cur === 'on_the_way' || cur === 'picked_up';
  const tripDone = cur === 'done' || b.status === 'completed';

  // Auto-poll every 6s while the panel is open, so booker watching
  // their trip sees status changes without manual refresh.
  React.useEffect(() => {
    if (!onReload) return;
    const t = setInterval(() => onReload(), 6000);
    return () => clearInterval(t);
  }, [onReload]);

  // Poll location every 8s while trip is active (booker-side view)
  React.useEffect(() => {
    if (!tripActive) { setLoc(null); return; }
    let cancelled = false;
    async function tick() {
      try {
        const { data, error } = await window.sb.rpc('drv_get_location', { p_booking_no: b.id });
        if (cancelled) return;
        if (!error && Array.isArray(data) && data.length > 0) setLoc(data[0]);
      } catch (_) {}
    }
    tick();
    const t = setInterval(tick, 8000);
    return () => { cancelled = true; clearInterval(t); };
  }, [tripActive, b.id]);

  // Render Leaflet map when we have a location
  React.useEffect(() => {
    if (!tripActive || !loc || !mapElRef.current || typeof window.L === 'undefined') return;
    const L = window.L;
    if (!mapInstRef.current) {
      mapInstRef.current = L.map(mapElRef.current, { zoomControl: true, attributionControl: false })
        .setView([loc.lat, loc.lng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 })
        .addTo(mapInstRef.current);
      markerRef.current = L.marker([loc.lat, loc.lng]).addTo(mapInstRef.current);
    } else {
      markerRef.current.setLatLng([loc.lat, loc.lng]);
      mapInstRef.current.setView([loc.lat, loc.lng], mapInstRef.current.getZoom());
    }
  }, [loc, tripActive]);

  // Cleanup map on unmount
  React.useEffect(() => () => {
    if (mapInstRef.current) { mapInstRef.current.remove(); mapInstRef.current = null; }
  }, []);

  // Driver clicks a status button — advance trip
  async function setStatus(next) {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await window.sb.rpc('drv_set_trip_status', {
        p_booking_no: b.id, p_status: next,
      });
      if (error) throw error;
      onReload && await onReload();
      // Auto-stop GPS share when trip moves to delivered / done
      if (next === 'delivered' || next === 'done') stopGpsShare();
    } catch (e) {
      alert(e.message || 'อัปเดตสถานะไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  // Driver toggles GPS share
  function startGpsShare() {
    if (!('geolocation' in navigator)) {
      setShareErr('เบราว์เซอร์ไม่รองรับ GPS');
      return;
    }
    setShareErr('');
    setSharing(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const now = Date.now();
        // Throttle: 1 upload per 30s to avoid hammering Supabase
        if (now - lastUploadRef.current < 30_000) return;
        lastUploadRef.current = now;
        try {
          await window.sb.rpc('drv_post_location', {
            p_booking_no: b.id,
            p_lat: pos.coords.latitude,
            p_lng: pos.coords.longitude,
            p_accuracy: pos.coords.accuracy,
          });
        } catch (_) {}
      },
      (err) => { setShareErr(err.message || 'ขอ GPS ไม่สำเร็จ'); setSharing(false); },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 }
    );
  }
  function stopGpsShare() {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setSharing(false);
  }
  React.useEffect(() => () => stopGpsShare(), []);

  // Booker rates the trip
  async function submitRating() {
    if (rateValue < 1) return;
    setBusy(true);
    try {
      const { error } = await window.sb.rpc('drv_rate_trip', {
        p_booking_no: b.id, p_rating: rateValue, p_comment: rateComment || null,
      });
      if (error) throw error;
      setRateSent(true);
      onReload && await onReload();
    } catch (e) {
      alert(e.message || 'ส่งคะแนนไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  // ───────── render ─────────
  if (b.status !== 'approved' && b.status !== 'completed') return null; // only show after admin approves
  const ageStr = loc ? (loc.age_seconds < 60 ? `${loc.age_seconds} วินาทีก่อน` : `${Math.floor(loc.age_seconds/60)} นาทีก่อน`) : '';

  return (
    <Card style={{padding:20, border:"2px solid var(--blue-200)", background:"linear-gradient(180deg, #f5f9ff 0%, #fff 100%)"}}>
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8}}>
        <h3 style={{margin:0, fontSize:15, color:"var(--blue-700)"}}>📡 สถานะ trip แบบ real-time</h3>
        <div style={{fontSize:11, color:"var(--ink-3)"}}>อัปเดตอัตโนมัติทุก 6 วินาที</div>
      </div>

      {/* 1. Progress steps */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", margin:"4px 0 18px", gap:4}}>
        {STATUS_FLOW.map((s, i) => {
          const reached = i <= curIdx;
          const isCurrent = i === curIdx;
          return (
            <React.Fragment key={s.key}>
              <div style={{flex:"0 0 auto", textAlign:"center"}}>
                <div style={{
                  width:34, height:34, borderRadius:"50%", margin:"0 auto",
                  background: reached ? "var(--blue-600)" : "#fff",
                  border: "2px solid " + (reached ? "var(--blue-600)" : "var(--line)"),
                  color: reached ? "#fff" : "var(--ink-3)",
                  display:"grid", placeItems:"center", fontSize:14, fontWeight:700,
                  boxShadow: isCurrent ? "0 0 0 4px rgba(43,95,208,.15)" : "none",
                }}>{s.short}</div>
                <div style={{fontSize:11, marginTop:5, color: reached ? "var(--blue-700)" : "var(--ink-3)", fontWeight: isCurrent?700:500}}>{s.label}</div>
              </div>
              {i < STATUS_FLOW.length - 1 && (
                <div style={{flex:1, height:3, background: i < curIdx ? "var(--blue-600)" : "var(--line)", borderRadius:2, marginTop:-16}}/>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* 2. Driver action buttons (visible to anyone with the page — driver clicks via shared link or admin clicks on driver's behalf) */}
      {!tripDone && (
        <div style={{padding:"12px 14px", background:"#fff", border:"1px dashed var(--blue-200)", borderRadius:10, marginBottom: tripActive ? 14 : 0}}>
          <div style={{fontSize:12, color:"var(--ink-3)", marginBottom:8}}>📞 สำหรับคนขับ — กดเมื่อถึงแต่ละขั้น</div>
          <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
            {STATUS_FLOW.slice(1).map((s) => {
              const idx = STATUS_FLOW.findIndex(x => x.key === s.key);
              const isPast = idx <= curIdx;
              const isNext = idx === curIdx + 1;
              return (
                <button key={s.key} onClick={() => setStatus(s.key)} disabled={busy || isPast}
                  style={{
                    flex:"1 1 auto", minWidth:100, padding:"10px 12px",
                    border: "1.5px solid " + (isNext ? "var(--blue-600)" : isPast ? "var(--blue-200)" : "var(--line)"),
                    borderRadius: 8,
                    background: isNext ? "var(--blue-600)" : isPast ? "var(--blue-50)" : "#fff",
                    color: isNext ? "#fff" : isPast ? "var(--blue-700)" : "var(--ink-2)",
                    cursor: isPast || busy ? "default" : "pointer",
                    fontSize:13, fontWeight:600, fontFamily:"inherit",
                    opacity: isPast ? 0.7 : 1,
                  }}>
                  {isPast ? "✓ " : ""}{s.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. GPS map (booker side) — when trip is active */}
      {tripActive && (
        <div style={{marginBottom: isOwner ? 0 : 14}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6}}>
            <div style={{fontSize:13, fontWeight:600, color:"var(--ink-2)"}}>📍 ตำแหน่งคนขับ</div>
            <div style={{fontSize:11, color:"var(--ink-3)"}}>{loc ? `อัปเดตล่าสุด: ${ageStr}` : 'ยังไม่ได้รับตำแหน่ง'}</div>
          </div>
          <div ref={mapElRef} style={{
            height:220, borderRadius:10, overflow:"hidden",
            border:"1px solid var(--line)",
            background: loc ? "transparent" : "repeating-linear-gradient(45deg,#f1f5ff 0 8px,#e8eefd 8px 16px)",
            display: loc ? "block" : "grid", placeItems: loc ? "initial" : "center",
            color:"var(--ink-3)", fontSize:13,
          }}>
            {!loc && (sharing ? 'กำลังรอตำแหน่งแรก...' : 'คนขับยังไม่ได้แชร์ตำแหน่ง')}
          </div>
        </div>
      )}

      {/* 4. GPS share toggle (driver side) */}
      {tripActive && (
        <div style={{padding:"10px 14px", background:"var(--warn-bg)", border:"1px dashed #f5dca0", borderRadius:10}}>
          <div style={{fontSize:12, color:"var(--warn)", marginBottom:8}}>📡 สำหรับคนขับ — กดเริ่มเพื่อแชร์ตำแหน่งให้คนจอง</div>
          <div style={{display:"flex", gap:8, alignItems:"center", flexWrap:"wrap"}}>
            {!sharing ? (
              <button onClick={startGpsShare} disabled={busy} style={{padding:"8px 18px", background:"var(--ok)", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer"}}>
                ▶ เริ่มแชร์ตำแหน่ง
              </button>
            ) : (
              <button onClick={stopGpsShare} style={{padding:"8px 18px", background:"#fff", color:"var(--err)", border:"1.5px solid var(--err)", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer"}}>
                ⏸ หยุดแชร์
              </button>
            )}
            <span style={{fontSize:11, color:"var(--ink-3)"}}>
              {sharing ? '⚠️ อย่าปิด tab นี้ — ตำแหน่งจะหยุดส่ง' : 'ระบบจะส่งตำแหน่งให้คนจองทุก 30 วินาที'}
            </span>
          </div>
          {shareErr && <div style={{marginTop:6, fontSize:11, color:"var(--err)"}}>{shareErr}</div>}
        </div>
      )}

      {/* 5. Rating (after done) — only owner can rate */}
      {tripDone && isOwner && (
        <div style={{marginTop:14, paddingTop:14, borderTop:"1px solid var(--line)"}}>
          {rateSent ? (
            <div style={{padding:"10px 14px", background:"var(--ok-bg)", border:"1px dashed var(--ok)", borderRadius:10, color:"var(--ok)", fontSize:13, fontWeight:500, textAlign:"center"}}>
              🙏 ขอบคุณสำหรับคะแนน {rateValue} ดาว — บันทึกแล้ว
            </div>
          ) : (
            <div style={{padding:"12px 14px", background:"#fff", border:"1.5px solid var(--blue-200)", borderRadius:10}}>
              <div style={{fontSize:13, fontWeight:600, marginBottom:8}}>🌟 ให้คะแนนคนขับ — Trip จบแล้ว</div>
              <div style={{display:"flex", gap:6, marginBottom:10}}>
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => setRateValue(n)} style={{
                    background:"none", border:"none", cursor:"pointer", padding:0,
                    fontSize:30, color: n <= rateValue ? "#fbbf24" : "#cbd5e1",
                    transition:"transform .08s", lineHeight:1,
                  }}
                  onMouseEnter={e => e.target.style.transform = "scale(1.15)"}
                  onMouseLeave={e => e.target.style.transform = "scale(1)"}>★</button>
                ))}
              </div>
              <textarea value={rateComment} onChange={e => setRateComment(e.target.value)}
                placeholder="ความคิดเห็น (ไม่บังคับ)"
                style={{width:"100%", padding:"8px 10px", border:"1px solid var(--line)", borderRadius:8, fontSize:13, fontFamily:"inherit", resize:"vertical", minHeight:50, marginBottom:8}}/>
              <button onClick={submitRating} disabled={rateValue < 1 || busy} style={{padding:"8px 18px", background:"var(--blue-600)", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor: rateValue<1?"not-allowed":"pointer", opacity: rateValue<1?0.5:1}}>
                {busy ? 'กำลังบันทึก...' : 'บันทึกคะแนน'}
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

Object.assign(window, { TrackScreen, LiveTripPanel });
