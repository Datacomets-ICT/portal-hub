// Booking form (single-page): renders every section stacked + a sticky
// submit button at the bottom. Old multi-step wizard with per-step "ถัดไป"
// buttons + key-based remount (which silently dropped the user's data on
// step change → white-screen on submit) is gone.
const { useState: uS } = React;

const BookingFlow = ({ setPage, empId, password, onComplete, editKey, editFrom }) => {
  // If we're in edit mode (editKey + editFrom passed), seed the form with
  // the existing booking; otherwise start blank.
  const seed = editFrom ? bookingToFormData(editFrom) : {
    date: "", timeOut: "", timeArrive: "", timeBack: "",
    job: null,
    pickupMode: "list", pickup: null, pickupCustom: {name:"", map:"", detail:""},
    dropoffMode: "list", dropoff: null, dropoffCustom: {name:"", map:"", detail:""},
    purpose: "", purposeDetail: "",
  };
  const [data, setData] = uS(seed);
  const isEdit = !!editKey;
  const update = (patch) => setData(d => ({...d, ...patch}));

  const back = () => setPage({name:"home"});

  const [submitted, setSubmitted] = uS(false);
  const [bookingNo, setBookingNo] = uS("");
  const [error, setError] = uS("");
  const [submitting, setSubmitting] = uS(false);

  const isValid = () => {
    if (!data.date || !data.timeOut || !data.timeArrive || !data.timeBack) return "กรุณากรอกวันที่และเวลาให้ครบ";
    if (!data.job) return "กรุณาเลือกประเภทงาน";
    const pickupOK = data.pickupMode === "list" ? !!data.pickup : !!(data.pickupCustom.name && data.pickupCustom.map);
    if (!pickupOK) return "กรุณาเลือก/ระบุจุดรับ";
    const dropoffOK = data.dropoffMode === "list" ? !!data.dropoff : !!(data.dropoffCustom.name && data.dropoffCustom.map);
    if (!dropoffOK) return "กรุณาเลือก/ระบุจุดส่ง";
    if (!data.purpose || !data.purposeDetail) return "กรุณาเลือกและระบุวัตถุประสงค์";
    return "";
  };

  const submit = async () => {
    const why = isValid();
    if (why) { setError(why); window.scrollTo({top:0, behavior:"smooth"}); return; }
    setError("");
    setSubmitting(true);
    try {
      const pickup = data.pickupMode === "list" ? data.pickup : data.pickupCustom;
      const dropoff = data.dropoffMode === "list" ? data.dropoff : data.dropoffCustom;
      const payload = {
        date: data.date,
        timeOut: data.timeOut,
        timeArrive: data.timeArrive,
        timeBack: data.timeBack,
        jobType: data.job?.id,
        purpose: data.purpose,
        purposeDetail: data.purposeDetail,
        pickupId:     data.pickupMode === "list" && pickup?.id  ? String(pickup.id)  : "",
        pickupName:   pickup?.name   || "",
        pickupDetail: pickup?.detail || "",
        pickupMap:    pickup?.map    || "",
        dropoffId:     data.dropoffMode === "list" && dropoff?.id ? String(dropoff.id) : "",
        dropoffName:   dropoff?.name   || "",
        dropoffDetail: dropoff?.detail || "",
        dropoffMap:    dropoff?.map    || "",
      };
      const rpcName = isEdit ? 'drv_update_my_booking' : 'drv_create_booking';
      const args = isEdit
        ? { p_emp_id: empId, p_password: password, p_booking_key: editKey, payload }
        : { p_emp_id: empId, p_password: password, payload };
      const { data: res, error: err } = await window.sb.rpc(rpcName, args);
      if (err) throw err;
      if (!res || !res.success) throw new Error(res?.message || (isEdit ? 'บันทึกไม่สำเร็จ' : 'จองไม่สำเร็จ'));
      setBookingNo(res.bookingNo);
      setSubmitted(true);
      onComplete && onComplete();
    } catch (e) {
      setError(e.message || 'เกิดข้อผิดพลาด');
      window.scrollTo({top:0, behavior:"smooth"});
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Card style={{padding:40, textAlign:"center", maxWidth:560, margin:"40px auto"}}>
        <div style={{width:72, height:72, borderRadius:"50%", background:"var(--ok-bg)", color:"var(--ok)", display:"grid", placeItems:"center", fontSize:32, margin:"0 auto 16px"}}>
          <Ico.Check/>
        </div>
        <h2 style={{margin:"0 0 6px", fontSize:22}}>{isEdit ? 'บันทึกการแก้ไขเรียบร้อย' : 'ส่งคำขอจองเรียบร้อย'}</h2>
        <p style={{margin:"0 0 6px", color:"var(--ink-3)", fontSize:14}}>รหัสการจอง</p>
        <div className="mono" style={{fontSize:22, fontWeight:700, color:"var(--blue-700)", margin:"0 0 20px", letterSpacing:1}}>{bookingNo}</div>
        <p style={{margin:"0 0 24px", color:"var(--ink-3)", fontSize:13}}>{isEdit ? 'รายการของคุณยังอยู่ในสถานะ "รอ Admin อนุมัติ"' : 'ระบบจะส่งการแจ้งเตือนเมื่อหัวหน้างานอนุมัติและจัดสรรรถ'}</p>
        <div style={{display:"flex", gap:10, justifyContent:"center"}}>
          <Btn variant="ghost" onClick={()=>setPage({name:"track"})}>ดูสถานะการจอง</Btn>
          <Btn onClick={()=>setPage({name:"home"})}>กลับหน้าแรก</Btn>
        </div>
      </Card>
    );
  }

  const why = isValid();

  return (
    <div className="anim-fade" style={{paddingBottom:96}}>
      <div style={{marginBottom:18, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12}}>
        <div className="anim-fade-up">
          <button onClick={back} style={{background:"none", border:"none", cursor:"pointer", color:"var(--ink-3)", fontSize:13, display:"inline-flex", alignItems:"center", gap:4, padding:0, marginBottom:8}}>
            <Ico.ArrowLeft/> ย้อนกลับ
          </button>
          <h1 style={{margin:0, fontSize:26, letterSpacing:"-.01em"}}>{isEdit ? 'แก้ไขการจอง' : 'จองรถ'}</h1>
          <p style={{margin:"4px 0 0", color:"var(--ink-3)", fontSize:14}}>{isEdit ? 'แก้ไขรายละเอียดได้ก่อน Admin อนุมัติเท่านั้น' : 'กรอกข้อมูลทั้งหมด แล้วกด '}<b>{isEdit ? '' : 'ยืนยันส่งคำขอ'}</b>{!isEdit && ' ด้านล่าง'}</p>
        </div>
      </div>

      {error ? (
        <div className="anim-fade-up" style={{
          marginBottom:14, padding:"12px 16px", borderRadius:10,
          background:"#FEE2E2", border:"1px solid #FCA5A5", color:"#991B1B",
          fontSize:13, fontWeight:500, display:"flex", gap:10, alignItems:"flex-start",
        }}>
          <span style={{fontSize:16, lineHeight:1}}>⚠️</span> {error}
        </div>
      ) : null}

      <div style={{display:"flex", flexDirection:"column", gap:16}}>
        <StepDateTime data={data} update={update}/>
        <StepJobType  data={data} update={update}/>
        <StepPickup   data={data} update={update}/>
        <StepDropoff  data={data} update={update}/>
        <StepPurpose  data={data} update={update}/>
      </div>

      {/* Sticky submit bar */}
      <div style={{
        position:"sticky", bottom:0, marginTop:24,
        background:"linear-gradient(to top, var(--bg) 60%, rgba(255,255,255,0))",
        padding:"16px 0 12px", display:"flex", justifyContent:"flex-end", gap:10, zIndex:20,
      }}>
        <Btn variant="ghost" onClick={back} icon={<Ico.ArrowLeft/>} disabled={submitting}>ยกเลิก</Btn>
        <Btn variant="primary" size="lg" onClick={submit} icon={<Ico.Check/>}
             disabled={submitting}
             title={why || "ส่งคำขอจองรถ"}
             style={{opacity: (why || submitting) ? 0.55 : 1}}>
          {submitting ? 'กำลังบันทึก…' : (isEdit ? 'บันทึกการแก้ไข' : 'ยืนยันส่งคำขอ')}
        </Btn>
      </div>
    </div>
  );
};

// Step: Date + times
const StepDateTime = ({ data, update }) => (
  <Card style={{padding:28}}>
    <h2 style={{margin:"0 0 4px", fontSize:18}}>วันที่และเวลา</h2>
    <p style={{margin:"0 0 22px", color:"var(--ink-3)", fontSize:13}}>กำหนดวันเดินทาง เวลาออก เวลาถึงปลายทาง และเวลากลับ</p>

    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16}}>
      <Field label="วันที่เดินทาง" required>
        <Input type="date" value={data.date} onChange={e=>update({date:e.target.value})} min="2026-04-24"/>
      </Field>
      <div></div>
      <Field label="เวลาออก" required hint="เวลาที่รถออกจากจุดรับ">
        <Input type="time" value={data.timeOut} onChange={e=>update({timeOut:e.target.value})}/>
      </Field>
      <Field label="เวลาถึงปลายทาง" required hint="เวลาที่คาดว่าจะถึงจุดส่ง">
        <Input type="time" value={data.timeArrive} onChange={e=>update({timeArrive:e.target.value})}/>
      </Field>
      <Field label="เวลากลับ" required hint="เวลาที่ต้องการกลับถึงจุดรับ">
        <Input type="time" value={data.timeBack} onChange={e=>update({timeBack:e.target.value})}/>
      </Field>
    </div>
  </Card>
);

// Step 2: Job type
const StepJobType = ({ data, update }) => (
  <Card style={{padding:28}}>
    <h2 style={{margin:"0 0 4px", fontSize:18}}>ประเภทงาน</h2>
    <p style={{margin:"0 0 22px", color:"var(--ink-3)", fontSize:13}}>เลือกประเภทของการเดินทางครั้งนี้</p>

    <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14}}>
      {JOB_TYPES.map(j => {
        const active = data.job?.id === j.id;
        return (
          <button key={j.id} onClick={()=>update({job:j})} style={{
            padding:"18px 16px", border:"1.5px solid "+(active?"var(--blue-600)":"var(--line)"),
            background: active?"var(--blue-50)":"#fff", borderRadius:12, cursor:"pointer",
            display:"flex", flexDirection:"column", alignItems:"flex-start", gap:8,
            textAlign:"left", fontFamily:"inherit",
          }}>
            <span style={{fontSize:24}}>{j.icon}</span>
            <b style={{color: active?"var(--blue-700)":"var(--ink)"}}>{j.label}</b>
          </button>
        );
      })}
    </div>
  </Card>
);

// Step 3 & 4: Place picker (reusable)
const PlacePicker = ({ title, sub, places, mode, setMode, selected, setSelected, custom, setCustom }) => {
  return (
    <Card style={{padding:28}}>
      <h2 style={{margin:"0 0 4px", fontSize:18}}>{title}</h2>
      <p style={{margin:"0 0 20px", color:"var(--ink-3)", fontSize:13}}>{sub}</p>

      <div style={{display:"inline-flex", padding:4, background:"var(--surface-2)", borderRadius:10, border:"1px solid var(--line)", marginBottom:20}}>
        <TabBtn active={mode==="list"} onClick={()=>setMode("list")}>เลือกจากฐานข้อมูล</TabBtn>
        <TabBtn active={mode==="custom"} onClick={()=>setMode("custom")}>อื่น ๆ (ระบุเอง)</TabBtn>
      </div>

      {mode === "list" ? (
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
          {places.map(p => {
            const active = selected?.id === p.id;
            return (
              <button key={p.id} onClick={()=>setSelected(p)} style={{
                padding:16, textAlign:"left", border:"1.5px solid "+(active?"var(--blue-600)":"var(--line)"),
                background: active?"var(--blue-50)":"#fff", borderRadius:12, cursor:"pointer", fontFamily:"inherit",
                display:"flex", gap:12, alignItems:"flex-start",
              }}>
                <span style={{width:36, height:36, borderRadius:10, background: active?"var(--blue-600)":"var(--blue-50)", color: active?"#fff":"var(--blue-700)", display:"grid", placeItems:"center", flexShrink:0}}>
                  <Ico.Pin/>
                </span>
                <div style={{flex:1, minWidth:0}}>
                  <b style={{display:"block", color: active?"var(--blue-700)":"var(--ink)"}}>{p.name}</b>
                  <div style={{fontSize:12, color:"var(--ink-3)", marginTop:2}}>{p.detail}</div>
                  <div style={{fontSize:11, color:"var(--blue-600)", marginTop:6, display:"inline-flex", alignItems:"center", gap:4}}>
                    <Ico.Link/> link map พร้อมใช้
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16}}>
          <Field label="ชื่อสถานที่" required>
            <Input value={custom.name} onChange={e=>setCustom({...custom, name:e.target.value})} placeholder="เช่น โรงแรมดิ เอทัส"/>
          </Field>
          <Field label="Link แผนที่ (Google Maps)" required>
            <Input value={custom.map} onChange={e=>setCustom({...custom, map:e.target.value})} placeholder="https://maps.google.com/..."/>
          </Field>
          <div style={{gridColumn:"1 / -1"}}>
            <Field label="รายละเอียดเพิ่มเติม" hint="เช่น ชั้น, ห้องประชุม, จุดจอดรถ">
              <Textarea value={custom.detail} onChange={e=>setCustom({...custom, detail:e.target.value})} placeholder="ระบุรายละเอียด..."/>
            </Field>
          </div>
          <div style={{gridColumn:"1 / -1"}}><RouteMap origin={custom.map} label={custom.name || "แสดงตัวอย่างแผนที่"}/></div>
        </div>
      )}
    </Card>
  );
};

const TabBtn = ({active, children, ...p}) => (
  <button {...p} style={{
    padding:"7px 14px", border:"none", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:"inherit",
    background: active?"#fff":"transparent", color: active?"var(--blue-700)":"var(--ink-3)",
    boxShadow: active?"var(--shadow-sm)":"none",
  }}>{children}</button>
);

const StepPickup = ({ data, update }) => (
  <PlacePicker
    title="จุดรับ" sub="เลือกสถานที่ที่รถจะไปรับ" places={PICKUP_PLACES}
    mode={data.pickupMode} setMode={m=>update({pickupMode:m})}
    selected={data.pickup} setSelected={p=>update({pickup:p})}
    custom={data.pickupCustom} setCustom={c=>update({pickupCustom:c})}
  />
);

const StepDropoff = ({ data, update }) => (
  <PlacePicker
    title="จุดส่ง" sub="เลือกสถานที่ปลายทาง" places={DROPOFF_PLACES}
    mode={data.dropoffMode} setMode={m=>update({dropoffMode:m})}
    selected={data.dropoff} setSelected={p=>update({dropoff:p})}
    custom={data.dropoffCustom} setCustom={c=>update({dropoffCustom:c})}
  />
);

// Step 5: Purpose
const StepPurpose = ({ data, update }) => (
  <Card style={{padding:28}}>
    <h2 style={{margin:"0 0 4px", fontSize:18}}>วัตถุประสงค์</h2>
    <p style={{margin:"0 0 22px", color:"var(--ink-3)", fontSize:13}}>เลือกวัตถุประสงค์และระบุรายละเอียด</p>

    <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:20}}>
      {PURPOSES.map(p => {
        const active = data.purpose === p;
        return (
          <button key={p} onClick={()=>update({purpose:p})} style={{
            padding:"12px 14px", border:"1.5px solid "+(active?"var(--blue-600)":"var(--line)"),
            background: active?"var(--blue-50)":"#fff", color: active?"var(--blue-700)":"var(--ink)",
            borderRadius:10, cursor:"pointer", fontSize:13, fontWeight:600, textAlign:"left", fontFamily:"inherit",
          }}>{p}</button>
        );
      })}
    </div>

    <Field label="รายละเอียดวัตถุประสงค์" required hint="ระบุรายละเอียดของการเดินทาง ผู้ร่วมเดินทาง หรือข้อมูลสำคัญอื่น ๆ">
      <Textarea value={data.purposeDetail} onChange={e=>update({purposeDetail:e.target.value})}
        placeholder="เช่น ประชุมกับลูกค้า ABC เรื่องสัญญาใหม่ ร่วมกับผู้จัดการฝ่ายจัดซื้อ 2 ท่าน..." style={{minHeight:110}}/>
    </Field>
  </Card>
);

// Convert a booking row (from drv_get_my_bookings → rowToBooking) back into
// the shape BookingFlow's internal `data` state expects.
function bookingToFormData(b) {
  const matchPickup  = (window.PICKUP_PLACES || []).find(p => p.name === b.pickup?.name);
  const matchDropoff = (window.DROPOFF_PLACES || []).find(p => p.name === b.dropoff?.name);
  const matchJob     = (window.JOB_TYPES || []).find(j => j.id === b.job?.id);
  return {
    date:        b.date || '',
    timeOut:     b.timeOut || '',
    timeArrive:  b.timeArrive || '',
    timeBack:    b.timeBack || '',
    job:         matchJob || b.job || null,
    pickupMode:  matchPickup ? 'list' : 'custom',
    pickup:      matchPickup || null,
    pickupCustom: matchPickup ? {name:'', map:'', detail:''}
                              : { name: b.pickup?.name || '', map: b.pickup?.map || '', detail: b.pickup?.detail || '' },
    dropoffMode: matchDropoff ? 'list' : 'custom',
    dropoff:     matchDropoff || null,
    dropoffCustom: matchDropoff ? {name:'', map:'', detail:''}
                                : { name: b.dropoff?.name || '', map: b.dropoff?.map || '', detail: b.dropoff?.detail || '' },
    purpose:       b.purpose || '',
    purposeDetail: b.purposeDetail || '',
  };
}

Object.assign(window, { BookingFlow, bookingToFormData });
