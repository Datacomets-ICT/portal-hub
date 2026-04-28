// Root app — begins at login; reveals main app after verify.
const { useState: uSA } = React;

function App() {
  const [verified, setVerified] = uSA(false);
  const [page, setPage] = uSA({name:"home"});
  const [empId, setEmpId] = uSA("");
  const [bookings, setBookings] = uSA(SAMPLE_BOOKINGS);

  const onComplete = ({id, data, empId, pickup, dropoff}) => {
    const emp = EMPLOYEES.find(e => e.id === empId);
    const now = new Date();
    const stamp = now.toLocaleDateString("th-TH",{day:"numeric",month:"short"}) + " " + now.toTimeString().slice(0,5);
    const newB = {
      id, employee: emp,
      date: data.date, timeOut: data.timeOut, timeArrive: data.timeArrive, timeBack: data.timeBack,
      job: data.job, pickup, dropoff, purpose: data.purpose, purposeDetail: data.purposeDetail,
      status:"pending",
      createdAt: now.toISOString().slice(0,16).replace("T"," "),
      timeline: [
        { at: stamp, label: "ส่งคำขอจอง", done: true },
        { at: "—", label: "รออนุมัติจากหัวหน้า", done: false },
        { at: "—", label: "จัดสรรรถและคนขับ", done: false },
      ],
    };
    setBookings(b => [newB, ...b]);
  };

  const logout = () => { setVerified(false); setEmpId(""); setPage({name:"home"}); };

  if (!verified) {
    return <LoginScreen onVerified={(id)=>{ setEmpId(id); setVerified(true); setPage({name:"home"}); }}/>;
  }

  return (
    <Shell page={page} setPage={setPage} empId={empId} onLogout={logout}>
      {page.name === "home" && <HomeScreen key="home" setPage={setPage} empId={empId}/>}
      {page.name === "booking" && (
        <BookingFlow key={"bk"+page.step} setPage={setPage} step={page.step ?? 0} empId={empId} onComplete={onComplete}/>
      )}
      {page.name === "track" && <TrackScreen key={"tr"+(page.id||"list")} setPage={setPage} empId={empId} bookings={bookings} detailId={page.id}/>}
    </Shell>
  );
}

// Full-screen login (gateway)
function LoginScreen({ onVerified }) {
  const [v, setV] = React.useState("");
  const [err, setErr] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const emp = EMPLOYEES.find(e => e.id === v.trim());

  const submit = () => {
    if(!v.trim()) { setErr("กรุณาใส่รหัสพนักงาน"); return; }
    if(!emp) { setErr("ไม่พบรหัสพนักงานนี้ในระบบ"); return; }
    setLoading(true);
    setTimeout(()=>onVerified(emp.id), 700);
  };

  return (
    <div style={{
      minHeight:"100vh", display:"grid", placeItems:"center", padding:24, position:"relative", overflow:"hidden",
      background: "linear-gradient(135deg, #eaf1ff 0%, #f5f7fb 55%, #eef4ff 100%)",
    }}>
      {/* Decorative blobs */}
      <div aria-hidden style={{position:"absolute", top:-120, right:-120, width:420, height:420, borderRadius:"50%", background:"radial-gradient(circle, rgba(43,95,208,.25), transparent 60%)", animation:"floatY 7s ease-in-out infinite"}}/>
      <div aria-hidden style={{position:"absolute", bottom:-140, left:-140, width:460, height:460, borderRadius:"50%", background:"radial-gradient(circle, rgba(14,42,107,.18), transparent 60%)", animation:"floatY 9s ease-in-out infinite reverse"}}/>

      <div className="anim-scale-in" style={{position:"relative", width:"100%", maxWidth:460}}>
        {/* Brand */}
        <div className="anim-fade-up" style={{display:"flex", alignItems:"center", justifyContent:"center", gap:12, marginBottom:26}}>
          <span style={{fontSize:46, lineHeight:0, display:"inline-flex"}} className="anim-float"><Ico.Logo/></span>
          <div>
            <div style={{fontSize:22, fontWeight:700, letterSpacing:.2, color:"var(--ink)"}}>Driver</div>
            <div style={{fontSize:12, color:"var(--ink-3)"}}>ระบบจองรถภายในองค์กร</div>
          </div>
        </div>

        <Card style={{padding:"34px 32px 30px", boxShadow:"var(--shadow-lg)", borderRadius:20}}>
          <div className="anim-fade-up" style={{
            width:60, height:60, borderRadius:16, margin:"0 auto 14px",
            background:"var(--blue-50)", color:"var(--blue-700)",
            display:"grid", placeItems:"center", fontSize:26, border:"1px solid var(--blue-100)",
            animation:"pulseRing 2.4s infinite, fadeUp .5s both",
          }}>
            <Ico.User/>
          </div>
          <h2 className="anim-fade-up" style={{margin:"0 0 6px", textAlign:"center", fontSize:24, letterSpacing:"-.01em", animationDelay:".05s"}}>ยืนยันตัวตน</h2>
          <p className="anim-fade-up" style={{margin:"0 0 22px", textAlign:"center", color:"var(--ink-3)", fontSize:13, animationDelay:".1s"}}>ใส่รหัสพนักงานเพื่อเริ่มการจองรถ</p>

          <div className="anim-fade-up" style={{animationDelay:".15s"}}>
            <Field label="รหัสพนักงาน" required hint="ตัวอย่าง: EMP10234, EMP10456, EMP10781, EMP11002" error={err}>
              <Input value={v} onChange={e=>{setV(e.target.value.toUpperCase()); setErr("");}}
                placeholder="EMP10234" className="mono"
                style={{fontFamily:"JetBrains Mono, monospace", letterSpacing:2, fontSize:16, padding:"13px 15px"}}
                onKeyDown={e=>{if(e.key==="Enter") submit();}}
                autoFocus/>
            </Field>
          </div>

          <div style={{minHeight:54, marginTop:12}}>
            {emp ? (
              <div className="anim-fade-up" style={{padding:12, borderRadius:10, background:"var(--ok-bg)", color:"var(--ok)", display:"flex", alignItems:"center", gap:10, fontSize:13}}>
                <span className="anim-check" style={{display:"inline-flex"}}><Ico.Check/></span>
                <span>พบข้อมูล: <b>{emp.name}</b> · {emp.dept}</span>
              </div>
            ) : null}
          </div>

          <Btn variant="primary" size="lg" style={{marginTop:4, width:"100%", justifyContent:"center"}}
               onClick={submit}
               disabled={loading}>
            {loading ? (
              <span style={{display:"inline-flex", alignItems:"center", gap:8}}>
                <Spinner/> กำลังยืนยัน…
              </span>
            ) : (<><Ico.ArrowRight/> เข้าสู่ระบบ</>)}
          </Btn>

          <div className="anim-fade-up" style={{marginTop:18, paddingTop:16, borderTop:"1px dashed var(--line)", textAlign:"center", fontSize:11, color:"var(--muted)", animationDelay:".25s"}}>
            ระบบจองรถสำหรับพนักงานภายในองค์กรเท่านั้น
          </div>
        </Card>

        <div className="anim-fade-up" style={{textAlign:"center", marginTop:16, fontSize:11, color:"var(--muted)", animationDelay:".3s"}}>
          © 2026 Driver · v1.0
        </div>
      </div>
    </div>
  );
}

function Spinner(){
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" style={{animation:"spin 1s linear infinite"}}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="3"/>
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </svg>
  );
}

ReactDOM.createRoot(document.getElementById("app")).render(<App/>);
