// Home: 2 big action buttons + quick stats
const HomeScreen = ({ setPage, empId, bookings = [] }) => {
  const mine = bookings.filter(b => b && b.employee && b.employee.id === empId);
  const upcoming = mine.filter(b => b.status !== "completed" && b.status !== "cancelled").length;
  const done = mine.filter(b => b.status === "completed").length;
  const pending = mine.filter(b => b.status === "pending").length;

  return (
    <div>
      {/* Hero */}
      <div className="anim-fade-up" style={{marginTop:8, marginBottom:28, display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:20, flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:13, color:"var(--blue-700)", fontWeight:600, letterSpacing:.4, textTransform:"uppercase"}}>สวัสดี 👋</div>
          <h1 style={{margin:"4px 0 6px", fontSize:34, letterSpacing:"-.01em", lineHeight:1.15}}>วันนี้คุณต้องการทำอะไร?</h1>
          <p style={{margin:0, color:"var(--ink-3)", fontSize:15, maxWidth:600}}>
            ระบบจองรถสำหรับพนักงาน — จองรถใหม่ หรือดูสถานะการจองของคุณได้จากที่นี่
          </p>
        </div>
        <div className="mono" style={{fontSize:12, color:"var(--ink-3)"}}>
          {new Date().toLocaleDateString("th-TH", {weekday:"long", day:"numeric", month:"long", year:"numeric"})}
        </div>
      </div>

      {/* Two big action buttons */}
      <div className="stagger" style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:20}}>
        <BigAction
          onClick={()=>setPage({name:"booking", step:0})}
          accent="blue"
          badge={upcoming > 0 ? `${upcoming} รายการกำลังใช้งาน` : "พร้อมให้บริการ"}
          title="จองรถ"
          sub="ส่งคำขอจองรถใหม่ — เลือกวัน เวลา จุดรับ–ส่ง และวัตถุประสงค์"
          icon={<Ico.Car/>}
          illustration={<IllusCar/>}
          cta="เริ่มจองรถ"
        />
        <BigAction
          onClick={()=>setPage({name:"track"})}
          accent="white"
          badge={pending > 0 ? `${pending} รายการรออนุมัติ` : `${mine.length} รายการทั้งหมด`}
          title="ติดตามผลการจอง"
          sub="ตรวจสอบสถานะคำขอ — อนุมัติ / จัดสรรรถแล้ว / เสร็จสิ้น พร้อมรายละเอียดเต็ม"
          icon={<Ico.Route/>}
          illustration={<IllusRoute/>}
          cta="ดูการจองของฉัน"
        />
      </div>

      {/* Quick stats row */}
      <div className="stagger" style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginTop:28}}>
        <StatCard n={mine.length}  label="การจองทั้งหมด" tint="blue"/>
        <StatCard n={pending}       label="รออนุมัติ" tint="amber"/>
        <StatCard n={mine.filter(b=>b.status==="approved").length} label="กำลังดำเนินการ" tint="green"/>
        <StatCard n={done}          label="เสร็จสิ้น" tint="grey"/>
      </div>

      {/* Upcoming list */}
      {mine.length ? (
        <section style={{marginTop:32}}>
          <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12}}>
            <h2 style={{margin:0, fontSize:18}}>การจองล่าสุดของคุณ</h2>
            <button onClick={()=>setPage({name:"track"})} style={{background:"none", border:"none", color:"var(--blue-700)", fontWeight:600, fontSize:13, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:4}}>
              ดูทั้งหมด <Ico.ArrowRight/>
            </button>
          </div>
          <Card>
            {mine.slice(0,2).map((b, i) => (
              <div key={b.id} onClick={()=>setPage({name:"track", id:b.id})} style={{
                padding:"14px 18px", display:"grid", gridTemplateColumns:"auto 1fr auto auto", gap:16, alignItems:"center",
                borderTop: i===0 ? "none" : "1px solid var(--line-2)", cursor:"pointer",
              }}>
                <div style={{
                  width:42, height:42, borderRadius:10, background:"var(--blue-50)",
                  color:"var(--blue-700)", display:"grid", placeItems:"center", fontSize:20,
                }}>{b.job.icon}</div>
                <div>
                  <div style={{display:"flex", gap:8, alignItems:"center"}}>
                    <b className="mono" style={{fontSize:12, color:"var(--ink-3)"}}>{b.id}</b>
                    <span style={{color:"var(--ink-3)"}}>·</span>
                    <span style={{fontWeight:600}}>{b.pickup.name} → {b.dropoff.name}</span>
                  </div>
                  <div style={{fontSize:13, color:"var(--ink-3)", marginTop:2}}>
                    {fmtDate(b.date)} · ออก {b.timeOut} · กลับ {b.timeBack}
                  </div>
                </div>
                <StatusBadge s={b.status}/>
                <Ico.ArrowRight style={{color:"var(--muted)"}}/>
              </div>
            ))}
          </Card>
        </section>
      ) : null}
    </div>
  );
};

const BigAction = ({ onClick, accent, badge, title, sub, icon, illustration, cta }) => {
  const isBlue = accent === "blue";
  return (
    <button onClick={onClick} className="lift peek-host" style={{
      textAlign:"left", cursor:"pointer", border:"1px solid "+(isBlue?"var(--blue-700)":"var(--line)"),
      background: isBlue
        ? "linear-gradient(135deg, var(--blue-600) 0%, var(--blue-700) 60%, var(--blue-900) 100%)"
        : "#fff",
      color: isBlue ? "#fff" : "var(--ink)",
      borderRadius:"var(--radius-lg)", padding:"28px 28px 24px",
      boxShadow: isBlue ? "0 20px 40px -24px rgba(30,76,189,.8)" : "var(--shadow-md)",
      position:"relative", overflow:"visible", minHeight:260,
      fontFamily:"inherit",
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
        <div style={{
          width:56, height:56, borderRadius:16, display:"grid", placeItems:"center", fontSize:28,
          background: isBlue ? "rgba(255,255,255,.14)" : "var(--blue-50)",
          color: isBlue ? "#fff" : "var(--blue-700)",
          border: isBlue ? "1px solid rgba(255,255,255,.2)" : "1px solid var(--blue-100)",
        }}>{icon}</div>
        <span className="anim-float" style={{
          fontSize:11, fontWeight:600, padding:"5px 10px", borderRadius:999,
          background: isBlue ? "rgba(255,255,255,.14)" : "var(--blue-50)",
          color: isBlue ? "#fff" : "var(--blue-700)",
          border: isBlue ? "1px solid rgba(255,255,255,.22)" : "1px solid var(--blue-100)",
        }}>{badge}</span>
      </div>
      <h2 style={{margin:"22px 0 6px", fontSize:30, letterSpacing:"-.01em"}}>{title}</h2>
      <p style={{margin:0, fontSize:14, lineHeight:1.55, color: isBlue ? "rgba(255,255,255,.82)" : "var(--ink-3)", maxWidth:380}}>{sub}</p>

      <div style={{
        position:"absolute", right:-10, bottom:-10, width:160, height:160, opacity: isBlue?.85:.9,
      }}>{illustration}</div>

      <div style={{marginTop:40, display:"inline-flex", alignItems:"center", gap:8, fontWeight:600, fontSize:14,
        color: isBlue ? "#fff" : "var(--blue-700)",
      }}>
        {cta} <Ico.ArrowRight/>
      </div>
    </button>
  );
};

const IllusCar = () => (
  <svg viewBox="0 0 200 200" width="100%" height="100%">
    <circle cx="140" cy="120" r="80" fill="rgba(255,255,255,.08)"/>
    <circle cx="140" cy="120" r="55" fill="rgba(255,255,255,.06)"/>
    <g transform="translate(70,90) scale(.9)" fill="none" stroke="rgba(255,255,255,.85)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 60h110M5 60v14a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4V60M95 60v14a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4V60"/>
      <path d="M0 60l8-26a10 10 0 0 1 9.6-7H102a10 10 0 0 1 9.6 7l8 26"/>
      <circle cx="22" cy="52" r="3" fill="rgba(255,255,255,.85)"/>
      <circle cx="98" cy="52" r="3" fill="rgba(255,255,255,.85)"/>
    </g>
  </svg>
);

const IllusRoute = () => (
  <svg viewBox="0 0 200 200" width="100%" height="100%">
    <circle cx="140" cy="120" r="80" fill="var(--blue-50)"/>
    <circle cx="140" cy="120" r="55" fill="var(--blue-100)" opacity=".6"/>
    <g transform="translate(80,60)" fill="none" stroke="var(--blue-600)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="20" cy="16" r="6" fill="var(--blue-600)"/>
      <circle cx="20" cy="16" r="2" fill="#fff"/>
      <path d="M20 22 Q20 60 50 60 Q80 60 80 90"/>
      <circle cx="80" cy="100" r="6" fill="var(--blue-700)"/>
      <circle cx="80" cy="100" r="2" fill="#fff"/>
    </g>
  </svg>
);

const StatCard = ({ n, label, tint }) => {
  const tints = {
    blue:{bg:"var(--blue-50)", fg:"var(--blue-700)"},
    amber:{bg:"var(--warn-bg)", fg:"var(--warn)"},
    green:{bg:"var(--ok-bg)", fg:"var(--ok)"},
    grey:{bg:"#eef1f7", fg:"var(--ink-2)"},
  }[tint] || {bg:"#eef1f7", fg:"var(--ink-2)"};
  return (
    <Card style={{padding:"16px 18px", display:"flex", alignItems:"center", gap:14}}>
      <div style={{width:42, height:42, borderRadius:12, background:tints.bg, color:tints.fg, display:"grid", placeItems:"center", fontSize:18, fontWeight:700}}>
        {n}
      </div>
      <div style={{fontSize:13, color:"var(--ink-2)", fontWeight:500}}>{label}</div>
    </Card>
  );
};

function fmtDate(d){
  try{
    return new Date(d).toLocaleDateString("th-TH", {day:"numeric", month:"short", year:"numeric"});
  }catch(e){ return d; }
}

Object.assign(window, { HomeScreen, fmtDate });
