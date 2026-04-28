// Booking wizard: login → booking form steps → summary
const { useState: uS } = React;

const BOOKING_STEPS = ["วัน–เวลา", "ประเภทงาน", "จุดรับ", "จุดส่ง", "วัตถุประสงค์", "ยืนยัน"];

const BookingFlow = ({ setPage, step, empId, onComplete }) => {
  const [data, setData] = uS({
    date: "", timeOut: "", timeArrive: "", timeBack: "",
    job: null,
    pickupMode: "list", pickup: null, pickupCustom: {name:"", map:"", detail:""},
    dropoffMode: "list", dropoff: null, dropoffCustom: {name:"", map:"", detail:""},
    purpose: "", purposeDetail: "",
  });
  const update = (patch) => setData(d => ({...d, ...patch}));

  const go = (s) => setPage({name:"booking", step:s});
  const next = () => go(step+1);
  const back = () => step === 0 ? setPage({name:"home"}) : go(step-1);

  return (
    <div className="anim-fade">
      <div style={{marginBottom:20, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12}}>
        <div className="anim-fade-up">
          <button onClick={back} style={{background:"none", border:"none", cursor:"pointer", color:"var(--ink-3)", fontSize:13, display:"inline-flex", alignItems:"center", gap:4, padding:0, marginBottom:8}}>
            <Ico.ArrowLeft/> ย้อนกลับ
          </button>
          <h1 style={{margin:0, fontSize:26, letterSpacing:"-.01em"}}>จองรถ</h1>
          <p style={{margin:"4px 0 0", color:"var(--ink-3)", fontSize:14}}>กรอกข้อมูลเพื่อส่งคำขอจองรถ · ขั้นตอนที่ {step+1} จาก {BOOKING_STEPS.length}</p>
        </div>
      </div>

      <div className="anim-fade-up" style={{marginBottom:22, animationDelay:".05s"}}><Stepper steps={BOOKING_STEPS} current={step}/></div>

      <div className="anim-fade-up" style={{animationDelay:".1s"}}>
        {step === 0 && <StepDateTime data={data} update={update} next={next}/>}
        {step === 1 && <StepJobType data={data} update={update} next={next}/>}
        {step === 2 && <StepPickup data={data} update={update} next={next}/>}
        {step === 3 && <StepDropoff data={data} update={update} next={next}/>}
        {step === 4 && <StepPurpose data={data} update={update} next={next}/>}
        {step === 5 && <StepConfirm data={data} empId={empId} onComplete={onComplete} back={back}/>}
      </div>
    </div>
  );
};

// Step: Date + times
const StepDateTime = ({ data, update, next }) => {
  const valid = data.date && data.timeOut && data.timeArrive && data.timeBack;
  return (
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

      <div style={{marginTop:26, display:"flex", justifyContent:"flex-end"}}>
        <Btn disabled={!valid} onClick={next} style={{opacity: valid?1:.5, pointerEvents: valid?"auto":"none"}} icon={<Ico.ArrowRight/>}>ถัดไป</Btn>
      </div>
    </Card>
  );
};

// Step 2: Job type
const StepJobType = ({ data, update, next }) => (
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

    <div style={{marginTop:26, display:"flex", justifyContent:"flex-end"}}>
      <Btn disabled={!data.job} onClick={next} style={{opacity: data.job?1:.5, pointerEvents: data.job?"auto":"none"}} icon={<Ico.ArrowRight/>}>ถัดไป</Btn>
    </div>
  </Card>
);

// Step 3 & 4: Place picker (reusable)
const PlacePicker = ({ title, sub, places, mode, setMode, selected, setSelected, custom, setCustom, next }) => {
  const valid = mode === "list" ? !!selected : !!(custom.name && custom.map);
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
          <div style={{gridColumn:"1 / -1"}}><MapStub label={custom.name || "แสดงตัวอย่างแผนที่"}/></div>
        </div>
      )}

      <div style={{marginTop:26, display:"flex", justifyContent:"flex-end"}}>
        <Btn disabled={!valid} onClick={next} style={{opacity: valid?1:.5, pointerEvents: valid?"auto":"none"}} icon={<Ico.ArrowRight/>}>ถัดไป</Btn>
      </div>
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

const StepPickup = ({ data, update, next }) => (
  <PlacePicker
    title="จุดรับ" sub="เลือกสถานที่ที่รถจะไปรับ" places={PICKUP_PLACES}
    mode={data.pickupMode} setMode={m=>update({pickupMode:m})}
    selected={data.pickup} setSelected={p=>update({pickup:p})}
    custom={data.pickupCustom} setCustom={c=>update({pickupCustom:c})}
    next={next}
  />
);

const StepDropoff = ({ data, update, next }) => (
  <PlacePicker
    title="จุดส่ง" sub="เลือกสถานที่ปลายทาง" places={DROPOFF_PLACES}
    mode={data.dropoffMode} setMode={m=>update({dropoffMode:m})}
    selected={data.dropoff} setSelected={p=>update({dropoff:p})}
    custom={data.dropoffCustom} setCustom={c=>update({dropoffCustom:c})}
    next={next}
  />
);

// Step 5: Purpose
const StepPurpose = ({ data, update, next }) => {
  const valid = data.purpose && data.purposeDetail;
  return (
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

      <div style={{marginTop:26, display:"flex", justifyContent:"flex-end"}}>
        <Btn disabled={!valid} onClick={next} style={{opacity: valid?1:.5, pointerEvents: valid?"auto":"none"}} icon={<Ico.ArrowRight/>}>ดูสรุป</Btn>
      </div>
    </Card>
  );
};

// Step 6: Confirm + summary display
const StepConfirm = ({ data, empId, onComplete, back }) => {
  const emp = EMPLOYEES.find(e => e.id === empId);
  const pickup = data.pickupMode === "list" ? data.pickup : {name:data.pickupCustom.name, detail:data.pickupCustom.detail, map:data.pickupCustom.map};
  const dropoff = data.dropoffMode === "list" ? data.dropoff : {name:data.dropoffCustom.name, detail:data.dropoffCustom.detail, map:data.dropoffCustom.map};
  const [submitted, setSubmitted] = uS(false);
  const [bookingId, setBookingId] = uS("");

  const submit = () => {
    const id = "BK-" + String(Date.now()).slice(-8);
    setBookingId(id); setSubmitted(true);
    onComplete && onComplete({id, data, empId, pickup, dropoff});
  };

  if(submitted) {
    return (
      <Card style={{padding:40, textAlign:"center", maxWidth:560, margin:"0 auto"}}>
        <div style={{width:72, height:72, borderRadius:"50%", background:"var(--ok-bg)", color:"var(--ok)", display:"grid", placeItems:"center", fontSize:32, margin:"0 auto 16px"}}>
          <Ico.Check/>
        </div>
        <h2 style={{margin:"0 0 6px", fontSize:22}}>ส่งคำขอจองเรียบร้อย</h2>
        <p style={{margin:"0 0 6px", color:"var(--ink-3)", fontSize:14}}>รหัสการจองของคุณคือ</p>
        <div className="mono" style={{fontSize:22, fontWeight:700, color:"var(--blue-700)", margin:"0 0 20px", letterSpacing:1}}>{bookingId}</div>
        <p style={{margin:"0 0 24px", color:"var(--ink-3)", fontSize:13}}>ระบบจะส่งการแจ้งเตือนเมื่อหัวหน้างานอนุมัติและจัดสรรรถ</p>
        <div style={{display:"flex", gap:10, justifyContent:"center"}}>
          <Btn variant="ghost" onClick={()=>location.hash="#track"}>ดูสถานะการจอง</Btn>
          <Btn onClick={()=>location.hash="#home"}>กลับหน้าแรก</Btn>
        </div>
      </Card>
    );
  }

  return (
    <div>
      <Card style={{padding:0, overflow:"hidden"}}>
        <div style={{padding:"20px 24px", background:"linear-gradient(90deg, var(--blue-600), var(--blue-700))", color:"#fff"}}>
          <div style={{fontSize:12, opacity:.85, fontWeight:600, letterSpacing:.5}}>สรุปคำขอจองรถ</div>
          <div style={{fontSize:20, fontWeight:700, marginTop:4}}>{pickup.name} → {dropoff.name}</div>
          <div style={{fontSize:13, opacity:.88, marginTop:2}}>{fmtDate(data.date)} · ออก {data.timeOut} · ถึง {data.timeArrive} · กลับ {data.timeBack}</div>
        </div>

        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:0}}>
          <SummaryRow label="ผู้จอง" icon={<Ico.User/>}>
            <div><b>{emp?.name}</b></div>
            <div className="mono" style={{fontSize:12, color:"var(--ink-3)"}}>{emp?.id} · {emp?.dept}</div>
          </SummaryRow>
          <SummaryRow label="ประเภทงาน" icon={<span style={{fontSize:16}}>{data.job?.icon}</span>}>
            <b>{data.job?.label}</b>
          </SummaryRow>
          <SummaryRow label="วันที่เดินทาง" icon={<Ico.Calendar/>}>
            <b>{fmtDate(data.date)}</b>
          </SummaryRow>
          <SummaryRow label="เวลา" icon={<Ico.Clock/>}>
            <div style={{display:"flex", gap:14, fontSize:13}}>
              <div><span style={{color:"var(--ink-3)"}}>ออก</span> <b>{data.timeOut}</b></div>
              <div><span style={{color:"var(--ink-3)"}}>ถึง</span> <b>{data.timeArrive}</b></div>
              <div><span style={{color:"var(--ink-3)"}}>กลับ</span> <b>{data.timeBack}</b></div>
            </div>
          </SummaryRow>
          <SummaryRow label="จุดรับ" icon={<Ico.Pin/>} full>
            <b>{pickup.name}</b>
            <div style={{fontSize:13, color:"var(--ink-3)", marginTop:2}}>{pickup.detail}</div>
            {pickup.map ? <a href={pickup.map} target="_blank" style={{fontSize:12, color:"var(--blue-600)", display:"inline-flex", alignItems:"center", gap:4, marginTop:4}}><Ico.Link/> เปิดแผนที่</a> : null}
          </SummaryRow>
          <SummaryRow label="จุดส่ง" icon={<Ico.Pin/>} full>
            <b>{dropoff.name}</b>
            <div style={{fontSize:13, color:"var(--ink-3)", marginTop:2}}>{dropoff.detail}</div>
            {dropoff.map ? <a href={dropoff.map} target="_blank" style={{fontSize:12, color:"var(--blue-600)", display:"inline-flex", alignItems:"center", gap:4, marginTop:4}}><Ico.Link/> เปิดแผนที่</a> : null}
          </SummaryRow>
          <SummaryRow label="วัตถุประสงค์" icon={<Ico.Check/>} full>
            <b>{data.purpose}</b>
            <div style={{fontSize:13, color:"var(--ink-2)", marginTop:4, lineHeight:1.55}}>{data.purposeDetail}</div>
          </SummaryRow>
        </div>
      </Card>

      <div style={{marginTop:20, display:"flex", justifyContent:"space-between", gap:10}}>
        <Btn variant="ghost" onClick={back} icon={<Ico.ArrowLeft/>}>กลับไปแก้ไข</Btn>
        <Btn variant="primary" size="lg" onClick={submit} icon={<Ico.Check/>}>ยืนยันส่งคำขอ</Btn>
      </div>
    </div>
  );
};

const SummaryRow = ({ label, icon, children, full }) => (
  <div style={{
    padding:"16px 24px", borderTop:"1px solid var(--line-2)",
    gridColumn: full ? "1 / -1" : "auto",
    display:"flex", gap:14, alignItems:"flex-start",
  }}>
    <div style={{width:34, height:34, borderRadius:10, background:"var(--blue-50)", color:"var(--blue-700)", display:"grid", placeItems:"center", flexShrink:0, fontSize:16}}>
      {icon}
    </div>
    <div style={{flex:1}}>
      <div style={{fontSize:11, color:"var(--ink-3)", fontWeight:600, letterSpacing:.4, textTransform:"uppercase", marginBottom:4}}>{label}</div>
      {children}
    </div>
  </div>
);

Object.assign(window, { BookingFlow });
