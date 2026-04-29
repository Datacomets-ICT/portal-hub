// Admin / manager view: every booking + approve / reject / assign / complete.
// Visible only when the current user has role manager / senior_manager /
// officer / system or is_admin. Calls drv_get_all_bookings + drv_update_booking.

const { useState: uSAd, useEffect: uEAd } = React;

const AdminScreen = ({ setPage, empId, password }) => {
  const [bookings, setBookings] = uSAd([]);
  const [loading, setLoading]   = uSAd(true);
  const [filter, setFilter]     = uSAd("pending");
  const [error, setError]       = uSAd("");
  const [detail, setDetail]     = uSAd(null);  // booking row open for action

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: err } = await window.sb.rpc('drv_get_all_bookings', {
        p_emp_id: empId, p_password: password,
      });
      if (err) throw err;
      if (!data || !data.success) throw new Error(data?.message || 'โหลดไม่สำเร็จ');
      setBookings((data.bookings || []).map(rowToBooking));
    } catch (e) {
      setError(e.message || 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }, [empId, password]);

  uEAd(() => { reload(); }, [reload]);

  const counts = {
    all:       bookings.length,
    pending:   bookings.filter(b => b.status === 'pending').length,
    approved:  bookings.filter(b => b.status === 'approved').length,
    completed: bookings.filter(b => b.status === 'completed').length,
    rejected:  bookings.filter(b => b.status === 'rejected').length,
    cancelled: bookings.filter(b => b.status === 'cancelled').length,
  };
  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter);

  if (detail) {
    return <AdminDetail b={detail} empId={empId} password={password}
      back={() => { setDetail(null); reload(); }}
      onChanged={() => reload()} />;
  }

  return (
    <div>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-end", gap:20, flexWrap:"wrap", marginBottom:18}}>
        <div>
          <h1 style={{margin:0, fontSize:26, letterSpacing:"-.01em"}}>จัดการคำขอจองรถ</h1>
          <p style={{margin:"4px 0 0", color:"var(--ink-3)", fontSize:14}}>
            อนุมัติ / ไม่อนุมัติ / จัดสรรรถ + คนขับ / ปิดงาน
          </p>
        </div>
        <Btn variant="ghost" onClick={reload} icon={<Ico.Plus/>}>รีเฟรช</Btn>
      </div>

      {error ? (
        <div style={{
          marginBottom:14, padding:"12px 16px", borderRadius:10,
          background:"#FEE2E2", border:"1px solid #FCA5A5", color:"#991B1B",
          fontSize:13, fontWeight:500,
        }}>⚠️ {error}</div>
      ) : null}

      {/* Filter tabs */}
      <div style={{display:"flex", gap:4, padding:4, background:"#fff", border:"1px solid var(--line)", borderRadius:12, marginBottom:16, width:"fit-content", flexWrap:"wrap"}}>
        {[
          ["pending","รออนุมัติ", counts.pending],
          ["approved","อนุมัติแล้ว", counts.approved],
          ["completed","เสร็จสิ้น", counts.completed],
          ["rejected","ไม่อนุมัติ", counts.rejected],
          ["cancelled","ยกเลิก", counts.cancelled],
          ["all","ทั้งหมด", counts.all],
        ].map(([k,l,n]) => (
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

      {loading ? (
        <Card style={{padding:40, textAlign:"center", color:"var(--ink-3)"}}>กำลังโหลด…</Card>
      ) : filtered.length === 0 ? (
        <Card style={{padding:60, textAlign:"center"}}>
          <div style={{fontSize:40, color:"var(--muted)", marginBottom:8}}><Ico.Check/></div>
          <div style={{fontWeight:600}}>ไม่มีรายการในหมวดนี้</div>
        </Card>
      ) : (
        <div style={{display:"grid", gap:12}}>
          {filtered.map(b => (
            <AdminCard key={b.key} b={b} onClick={()=>setDetail(b)}/>
          ))}
        </div>
      )}
    </div>
  );
};

const AdminCard = ({ b, onClick }) => (
  <Card onClick={onClick} style={{padding:0, cursor:"pointer", overflow:"hidden", transition:"box-shadow .15s, border-color .15s"}}
    onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--blue-200)"; e.currentTarget.style.boxShadow="var(--shadow-md)";}}
    onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--line)"; e.currentTarget.style.boxShadow="var(--shadow-sm)";}}>
    <div style={{padding:"16px 22px", display:"grid", gridTemplateColumns:"auto 1fr auto auto", gap:18, alignItems:"center"}}>
      <div style={{width:46, height:46, borderRadius:12, background:"var(--blue-50)", display:"grid", placeItems:"center", fontSize:22}}>
        {b.job?.icon || '•'}
      </div>
      <div style={{minWidth:0}}>
        <div style={{display:"flex", gap:10, alignItems:"center", marginBottom:4, flexWrap:"wrap"}}>
          <b className="mono" style={{fontSize:12, color:"var(--ink-3)"}}>{b.id}</b>
          <StatusBadge s={b.status}/>
        </div>
        <div style={{fontWeight:600, fontSize:14}}>{b.pickup.name} → {b.dropoff.name}</div>
        <div style={{fontSize:12, color:"var(--ink-3)", marginTop:3, display:"flex", gap:10, flexWrap:"wrap"}}>
          <span><Ico.User style={{marginRight:3, verticalAlign:"-2px"}}/> {b.employee?.name} ({b.employee?.id})</span>
          <span><Ico.Calendar style={{marginRight:3, verticalAlign:"-2px"}}/> {fmtDate(b.date)}</span>
          <span><Ico.Clock style={{marginRight:3, verticalAlign:"-2px"}}/> {b.timeOut}–{b.timeBack}</span>
        </div>
      </div>
      <div style={{textAlign:"right", fontSize:12, color:"var(--ink-3)"}}>
        {b.car ? (
          <div>
            <div className="mono" style={{fontWeight:600, color:"var(--ink-2)"}}>{b.car.plate}</div>
            <div>{b.driver?.name || '—'}</div>
          </div>
        ) : <div style={{color:"var(--warn)", fontWeight:600}}>ยังไม่จัดสรร</div>}
      </div>
      <div style={{color:"var(--muted)", fontSize:18}}><Ico.ArrowRight/></div>
    </div>
  </Card>
);

const AdminDetail = ({ b, empId, password, back, onChanged }) => {
  const [carId, setCarId]     = uSAd(b.car ? findCarIdByPlate(b.car.plate) : "");
  const [drvId, setDrvId]     = uSAd(b.driver ? findDriverIdByNo(b.driver.id) : "");
  const [reason, setReason]   = uSAd("");
  const [busy, setBusy]       = uSAd(false);
  const [err, setErr]         = uSAd("");
  const [chatOpen, setChatOpen] = uSAd(false);

  const call = async (patch) => {
    setBusy(true);
    setErr("");
    try {
      const { data, error } = await window.sb.rpc('drv_update_booking', {
        p_emp_id: empId, p_password: password,
        payload: { key: b.key, ...patch },
      });
      if (error) throw error;
      if (!data || !data.success) throw new Error(data?.message || 'อัปเดตไม่สำเร็จ');
      onChanged && await onChanged();
      back();
    } catch (e) {
      setErr(e.message || 'เกิดข้อผิดพลาด');
    } finally {
      setBusy(false);
    }
  };

  const approve  = () => call({ status: 'approved', carId, driverId: drvId });
  const reject   = () => {
    if (!reason.trim()) { setErr("กรุณาระบุเหตุผลการไม่อนุมัติ"); return; }
    call({ status: 'rejected', rejectedReason: reason.trim() });
  };
  const complete = () => call({ status: 'completed' });
  const assign   = () => call({ carId, driverId: drvId });

  return (
    <div>
      <button onClick={back} style={{background:"none", border:"none", cursor:"pointer", color:"var(--ink-3)", fontSize:13, display:"inline-flex", alignItems:"center", gap:4, padding:0, marginBottom:12}}>
        <Ico.ArrowLeft/> รายการทั้งหมด
      </button>

      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18, flexWrap:"wrap", gap:12}}>
        <div>
          <div className="mono" style={{fontSize:13, color:"var(--ink-3)", fontWeight:600, marginBottom:4}}>{b.id}</div>
          <h1 style={{margin:0, fontSize:24, letterSpacing:"-.01em"}}>{b.pickup.name} → {b.dropoff.name}</h1>
          <div style={{color:"var(--ink-3)", fontSize:14, marginTop:4}}>
            ผู้จอง: <b>{b.employee?.name}</b> ({b.employee?.id}) · {b.employee?.dept || '-'} · ส่งเมื่อ {b.createdAt}
          </div>
        </div>
        <div style={{display:"flex", gap:10, alignItems:"center"}}>
          <StatusBadge s={b.status}/>
          <button onClick={()=>setChatOpen(true)}
            style={{padding:"8px 14px", border:"1px solid var(--blue-600)", background:"var(--blue-50)", color:"var(--blue-700)",
                    borderRadius:8, fontSize:13, fontWeight:600, fontFamily:"inherit", cursor:"pointer",
                    display:"inline-flex", alignItems:"center", gap:6}}>
            💬 แชทกับผู้แจ้ง
          </button>
        </div>
      </div>
      {chatOpen ? (
        <BookingChat bookingKey={b.key} bookingNo={b.id} empId={empId} password={password} isAdmin={true} onClose={()=>setChatOpen(false)}/>
      ) : null}

      {err ? (
        <div style={{marginBottom:14, padding:"12px 16px", borderRadius:10, background:"#FEE2E2", border:"1px solid #FCA5A5", color:"#991B1B", fontSize:13, fontWeight:500}}>
          ⚠️ {err}
        </div>
      ) : null}

      <div style={{display:"grid", gridTemplateColumns:"1fr 360px", gap:20}}>
        {/* Left: trip details */}
        <div style={{display:"flex", flexDirection:"column", gap:16}}>
          <Card style={{padding:24}}>
            <h3 style={{margin:"0 0 14px", fontSize:15}}>เส้นทาง</h3>
            <div style={{display:"flex", gap:14, marginBottom:14}}>
              <div style={{display:"flex", flexDirection:"column", alignItems:"center", paddingTop:4}}>
                <div style={{width:12, height:12, borderRadius:"50%", background:"var(--blue-600)"}}/>
                <div style={{width:2, flex:1, minHeight:36, background:"var(--blue-200)", margin:"4px 0"}}/>
                <div style={{width:12, height:12, borderRadius:"50%", background:"var(--blue-900)"}}/>
              </div>
              <div style={{flex:1}}>
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:11, color:"var(--ink-3)", fontWeight:600, textTransform:"uppercase"}}>จุดรับ · {b.timeOut}</div>
                  <b>{b.pickup.name}</b>
                  <div style={{fontSize:13, color:"var(--ink-3)"}}>{b.pickup.detail}</div>
                </div>
                <div>
                  <div style={{fontSize:11, color:"var(--ink-3)", fontWeight:600, textTransform:"uppercase"}}>จุดส่ง · {b.timeArrive}</div>
                  <b>{b.dropoff.name}</b>
                  <div style={{fontSize:13, color:"var(--ink-3)"}}>{b.dropoff.detail}</div>
                </div>
              </div>
            </div>
            <RouteMap origin={b.pickup.map} destination={b.dropoff.map} label="เส้นทาง"/>
          </Card>

          <Card style={{padding:24}}>
            <h3 style={{margin:"0 0 10px", fontSize:15}}>วัตถุประสงค์</h3>
            <b>{b.purpose}</b>
            <p style={{margin:"6px 0 0", fontSize:14, color:"var(--ink-2)", lineHeight:1.6}}>{b.purposeDetail}</p>
          </Card>

          {b.rejectedReason ? (
            <Card style={{padding:24, background:"#FEE2E2", borderColor:"#FCA5A5"}}>
              <h3 style={{margin:"0 0 6px", fontSize:14, color:"#991B1B"}}>เหตุผลที่ไม่อนุมัติ</h3>
              <div style={{fontSize:14}}>{b.rejectedReason}</div>
            </Card>
          ) : null}

          {b.cancelReason ? (
            <Card style={{padding:24, background:"var(--surface-2)"}}>
              <h3 style={{margin:"0 0 6px", fontSize:14, color:"var(--ink-3)"}}>เหตุผลที่ผู้แจ้งยกเลิก</h3>
              <div style={{fontSize:14}}>{b.cancelReason}</div>
            </Card>
          ) : null}
        </div>

        {/* Right: action panel */}
        <div style={{display:"flex", flexDirection:"column", gap:16}}>
          <Card style={{padding:20}}>
            <h3 style={{margin:"0 0 14px", fontSize:14, color:"var(--ink-3)", fontWeight:600, textTransform:"uppercase"}}>ข้อมูลการเดินทาง</h3>
            <MiniRowAdm k="ประเภท" v={<span><span style={{marginRight:6}}>{b.job?.icon}</span>{b.job?.label}</span>}/>
            <MiniRowAdm k="วันที่" v={fmtDate(b.date)}/>
            <MiniRowAdm k="เวลา" v={`${b.timeOut} → ${b.timeArrive} → ${b.timeBack}`}/>
          </Card>

          {b.status === 'pending' || b.status === 'approved' ? (
            <Card style={{padding:20}}>
              <h3 style={{margin:"0 0 12px", fontSize:14, color:"var(--ink-3)", fontWeight:600, textTransform:"uppercase"}}>จัดสรรรถ + คนขับ</h3>
              <Field label="รถ">
                <select value={carId} onChange={e=>setCarId(e.target.value)} style={selStyle}>
                  <option value="">-- เลือกรถ --</option>
                  {CARS.map(c => <option key={c.id} value={c.id}>{c.plate} · {c.model} ({c.seats} ที่นั่ง)</option>)}
                </select>
              </Field>
              <Field label="คนขับ">
                <select value={drvId} onChange={e=>setDrvId(e.target.value)} style={selStyle}>
                  <option value="">-- เลือกคนขับ --</option>
                  {DRIVERS.map(d => <option key={d.id} value={d.id}>{d.driver_no} · {d.name}</option>)}
                </select>
              </Field>
            </Card>
          ) : null}

          {b.status === 'pending' ? (
            <>
              <Btn variant="primary" size="lg" onClick={approve} disabled={busy} icon={<Ico.Check/>} style={{justifyContent:"center"}}>
                {busy ? 'กำลังบันทึก…' : 'อนุมัติคำขอ'}
              </Btn>
              <Card style={{padding:16}}>
                <Field label="เหตุผลที่ไม่อนุมัติ" required hint="ผู้แจ้งจะเห็นเหตุผลนี้">
                  <Textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="เช่น ไม่จำเป็น / ใช้รถส่วนตัวได้" style={{minHeight:60}}/>
                </Field>
                <button onClick={reject} disabled={busy} style={{
                  width:"100%", padding:"10px 14px", border:"1px solid var(--err)",
                  background:"#fff", color:"var(--err)",
                  borderRadius:8, fontSize:13, fontWeight:600, fontFamily:"inherit", cursor:"pointer",
                }}>
                  ไม่อนุมัติ
                </button>
              </Card>
            </>
          ) : null}

          {b.status === 'approved' ? (
            <>
              <Btn variant="ghost" onClick={assign} disabled={busy || !carId && !drvId} icon={<Ico.Car/>} style={{justifyContent:"center"}}>
                {busy ? 'กำลังบันทึก…' : 'อัปเดตรถ/คนขับ'}
              </Btn>
              <Btn variant="primary" size="lg" onClick={complete} disabled={busy} icon={<Ico.Check/>} style={{justifyContent:"center"}}>
                {busy ? 'กำลังบันทึก…' : 'ปิดงาน (เดินทางเสร็จสิ้น)'}
              </Btn>
            </>
          ) : null}

          {b.status === 'rejected' || b.status === 'cancelled' || b.status === 'completed' ? (
            <Card style={{padding:14, background:"var(--surface-2)", textAlign:"center", color:"var(--ink-3)", fontSize:13}}>
              รายการนี้ปิดแล้ว — ไม่มี action เพิ่มเติม
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const selStyle = {
  width:"100%", padding:"10px 12px", border:"1px solid var(--line)",
  borderRadius:8, fontSize:14, fontFamily:"inherit", background:"#fff",
};

const MiniRowAdm = ({k, v}) => (
  <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", fontSize:13}}>
    <span style={{color:"var(--ink-3)"}}>{k}</span>
    <b style={{color:"var(--ink)"}}>{v}</b>
  </div>
);

function findCarIdByPlate(plate) {
  const c = CARS.find(x => x.plate === plate);
  return c ? String(c.id) : "";
}
function findDriverIdByNo(no) {
  const d = DRIVERS.find(x => x.driver_no === no);
  return d ? String(d.id) : "";
}

Object.assign(window, { AdminScreen });
