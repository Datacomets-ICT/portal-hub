// Shared UI building blocks
const { useState, useEffect, useRef, useMemo } = React;

const Shell = ({ children, page, setPage, empId, isAdmin, pendingCount, onLogout }) => (
  <div style={{minHeight:"100vh", display:"flex", flexDirection:"column"}}>
    <TopBar page={page} setPage={setPage} empId={empId} isAdmin={isAdmin} pendingCount={pendingCount} onLogout={onLogout} />
    <main style={{flex:1, width:"100%", maxWidth:1120, margin:"0 auto", padding:"28px 24px 64px"}}>
      {children}
    </main>
    <Footer/>
  </div>
);

const TopBar = ({ page, setPage, empId, isAdmin, pendingCount, onLogout }) => {
  const emp = EMPLOYEES.find(e => e.id === empId);
  return (
    <header style={{
      background:"#fff",
      borderBottom:"1px solid var(--line)",
      position:"sticky", top:0, zIndex:20,
      backdropFilter:"saturate(150%) blur(8px)",
      animation:"fadeIn .35s ease",
    }}>
      <div style={{maxWidth:1120, margin:"0 auto", padding:"12px 24px", display:"flex", alignItems:"center", gap:16}}>
        <button
          onClick={()=>setPage({name:"home"})}
          style={{display:"flex", alignItems:"center", gap:10, background:"none", border:"none", cursor:"pointer", padding:0}}>
          <span style={{fontSize:28, lineHeight:0, display:"inline-flex"}}><Ico.Logo/></span>
          <span style={{display:"flex", flexDirection:"column", alignItems:"flex-start", lineHeight:1.1}}>
            <b style={{fontSize:17, letterSpacing:.2}}>Driver</b>
            <span style={{fontSize:11, color:"var(--ink-3)"}}>ระบบจองรถภายในองค์กร</span>
          </span>
        </button>

        <nav style={{marginLeft:20, display:"flex", gap:4}}>
          <NavBtn active={page.name==="home"} onClick={()=>setPage({name:"home"})}><Ico.Home/> หน้าแรก</NavBtn>
          <NavBtn active={page.name==="booking"} onClick={()=>setPage({name:"booking", step:0})}><Ico.Car/> จองรถ</NavBtn>
          <NavBtn active={page.name==="track"} onClick={()=>setPage({name:"track"})}><Ico.Route/> ติดตามการจอง</NavBtn>
          {isAdmin ? (
            <NavBtn active={page.name==="admin"} onClick={()=>setPage({name:"admin"})}>
              <Ico.Check/> จัดการคำขอ
              {pendingCount > 0 ? (
                <span style={{
                  marginLeft:6, padding:"1px 8px", borderRadius:999,
                  background: page.name==="admin" ? "var(--blue-600)" : "var(--err)",
                  color:"#fff", fontSize:11, fontWeight:700, minWidth:18, textAlign:"center",
                  lineHeight:1.4,
                }}>{pendingCount}</span>
              ) : null}
            </NavBtn>
          ) : null}
          {isAdmin ? (
            <NavBtn active={page.name==="calendar"} onClick={()=>setPage({name:"calendar"})}><Ico.Calendar/> ปฏิทิน</NavBtn>
          ) : null}
        </nav>

        <div style={{marginLeft:"auto", display:"flex", alignItems:"center", gap:10}}>
          {emp ? (
            <div style={{display:"flex", alignItems:"center", gap:10, padding:"6px 10px 6px 6px", background:"var(--blue-50)", borderRadius:999, border:"1px solid var(--blue-100)"}}>
              <div style={{width:28, height:28, borderRadius:"50%", background:"var(--blue-600)", color:"#fff", display:"grid", placeItems:"center", fontSize:12, fontWeight:600}}>
                {emp.name.charAt(0)}
              </div>
              <div style={{fontSize:13, lineHeight:1.1}}>
                <div style={{fontWeight:600}}>{emp.name}</div>
                <div style={{color:"var(--ink-3)", fontSize:11}} className="mono">{emp.id}</div>
              </div>
            </div>
          ) : null}
          {/* Logout intentionally lives only in Workspace — sub-apps just
              link back via the "← Workspace" pill (rendered by _back.js). */}
        </div>
      </div>
    </header>
  );
};

const NavBtn = ({active, children, ...p}) => (
  <button {...p} style={{
    display:"inline-flex", alignItems:"center", gap:7,
    padding:"8px 14px", borderRadius:10, border:"none", cursor:"pointer",
    background: active ? "var(--blue-50)" : "transparent",
    color: active ? "var(--blue-700)" : "var(--ink-2)",
    fontWeight: active ? 600 : 500, fontSize:14,
    transition:"background .12s",
  }}>{children}</button>
);

const Footer = () => (
  <footer style={{borderTop:"1px solid var(--line)", background:"#fff", padding:"14px 24px", textAlign:"center", color:"var(--muted)", fontSize:12}}>
    © 2026 Driver · ระบบจองรถภายในองค์กร · v1.0
  </footer>
);

// Button
const Btn = ({ variant="primary", size="md", icon, children, style, ...p }) => {
  const base = {
    display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8,
    border:"1px solid transparent", cursor:"pointer",
    fontWeight:600, borderRadius:10,
    transition:"background .12s, box-shadow .12s, transform .06s",
    fontFamily:"inherit",
  };
  const sizes = {
    sm: {padding:"7px 12px", fontSize:13},
    md: {padding:"10px 18px", fontSize:14},
    lg: {padding:"14px 22px", fontSize:15},
  };
  const variants = {
    primary:{background:"var(--blue-600)", color:"#fff", boxShadow:"0 2px 0 var(--blue-700), 0 6px 18px -8px rgba(30,76,189,.6)"},
    ghost:{background:"transparent", color:"var(--ink-2)", borderColor:"var(--line)"},
    soft:{background:"var(--blue-50)", color:"var(--blue-700)", borderColor:"var(--blue-100)"},
    danger:{background:"#fff", color:"var(--err)", borderColor:"var(--line)"},
  };
  return <button {...p} style={{...base, ...sizes[size], ...variants[variant], ...style}}>
    {icon ? <span style={{display:"inline-flex", fontSize:"1.05em"}}>{icon}</span> : null}
    {children}
  </button>;
};

// Card
const Card = ({children, style, ...p}) => (
  <div {...p} style={{background:"#fff", border:"1px solid var(--line)", borderRadius:"var(--radius)", boxShadow:"var(--shadow-sm)", ...style}}>{children}</div>
);

// Field
const Field = ({ label, hint, error, children, required }) => (
  <label style={{display:"flex", flexDirection:"column", gap:6}}>
    <span style={{fontSize:13, fontWeight:600, color:"var(--ink-2)"}}>
      {label} {required ? <span style={{color:"var(--err)"}}>*</span> : null}
    </span>
    {children}
    {hint ? <span style={{fontSize:12, color:"var(--ink-3)"}}>{hint}</span> : null}
    {error ? <span style={{fontSize:12, color:"var(--err)"}}>{error}</span> : null}
  </label>
);

const inputStyle = {
  padding:"11px 13px", border:"1px solid var(--line)", borderRadius:10, fontSize:14,
  background:"#fff", color:"var(--ink)", outline:"none",
  transition:"border-color .12s, box-shadow .12s", width:"100%",
};
const Input = (p) => <input {...p} style={{...inputStyle, ...p.style}}
  onFocus={e=>{e.target.style.borderColor="var(--blue-500)"; e.target.style.boxShadow="0 0 0 3px rgba(43,95,208,.15)"; p.onFocus?.(e);}}
  onBlur={e=>{e.target.style.borderColor="var(--line)"; e.target.style.boxShadow="none"; p.onBlur?.(e);}} />;
const Textarea = (p) => <textarea {...p} style={{...inputStyle, minHeight:82, resize:"vertical", ...p.style}}
  onFocus={e=>{e.target.style.borderColor="var(--blue-500)"; e.target.style.boxShadow="0 0 0 3px rgba(43,95,208,.15)"; p.onFocus?.(e);}}
  onBlur={e=>{e.target.style.borderColor="var(--line)"; e.target.style.boxShadow="none"; p.onBlur?.(e);}} />;

// Status badge
const StatusBadge = ({ s }) => {
  const map = {
    pending:  {label:"รออนุมัติ",  bg:"var(--warn-bg)", fg:"var(--warn)"},
    approved: {label:"อนุมัติแล้ว", bg:"var(--ok-bg)",   fg:"var(--ok)"},
    completed:{label:"เสร็จสิ้น",  bg:"#eef1f7",        fg:"var(--ink-2)"},
    rejected: {label:"ไม่อนุมัติ", bg:"var(--err-bg)",  fg:"var(--err)"},
  };
  const m = map[s] || map.pending;
  return <span style={{
    display:"inline-flex", alignItems:"center", gap:6,
    padding:"4px 10px", borderRadius:999, fontSize:12, fontWeight:600,
    background:m.bg, color:m.fg,
  }}>
    <span style={{width:6, height:6, borderRadius:"50%", background:m.fg}}/>
    {m.label}
  </span>;
};

// Stepper
const Stepper = ({ steps, current }) => (
  <div style={{display:"flex", alignItems:"center", gap:6, flexWrap:"wrap"}}>
    {steps.map((s, i) => {
      const done = i < current, active = i === current;
      return (
        <React.Fragment key={i}>
          <div style={{display:"flex", alignItems:"center", gap:8, padding:"6px 12px 6px 6px", borderRadius:999,
            background: active ? "var(--blue-600)" : done ? "var(--blue-50)" : "transparent",
            color: active ? "#fff" : done ? "var(--blue-700)" : "var(--ink-3)",
            border: active ? "1px solid var(--blue-600)" : "1px solid "+(done?"var(--blue-100)":"var(--line)"),
            fontSize:13, fontWeight:600,
          }}>
            <span style={{
              width:22, height:22, borderRadius:"50%",
              background: active ? "#fff" : done ? "var(--blue-600)" : "var(--line-2)",
              color: active ? "var(--blue-700)" : done ? "#fff" : "var(--ink-3)",
              display:"grid", placeItems:"center", fontSize:12, fontWeight:700,
            }}>
              {done ? <Ico.Check/> : i+1}
            </span>
            {s}
          </div>
          {i < steps.length-1 ? <span style={{width:18, height:1, background:"var(--line)"}}/> : null}
        </React.Fragment>
      );
    })}
  </div>
);

// Map placeholder (used while origin/destination still empty)
const MapStub = ({ label="แผนที่" }) => (
  <div style={{
    height:140, borderRadius:10, border:"1px solid var(--line)",
    background:
      "repeating-linear-gradient(45deg, #f1f5ff 0 8px, #e8eefd 8px 16px)",
    position:"relative", overflow:"hidden",
  }}>
    <div style={{position:"absolute", inset:0, display:"grid", placeItems:"center", color:"var(--blue-700)"}}>
      <div style={{display:"flex", alignItems:"center", gap:8, background:"#fff", padding:"6px 12px", borderRadius:999, boxShadow:"var(--shadow-sm)", border:"1px solid var(--line)", fontSize:12, fontWeight:600}}>
        <Ico.Pin/> {label}
      </div>
    </div>
  </div>
);

// Extract "lat,lng" pair from any of the map URL formats we save:
//   https://maps.google.com/?q=13.7563,100.5018
//   https://www.google.com/maps?q=13.6900,100.7501
//   https://maps.google.com/maps?ll=...&q=...
// Returns null if no usable coordinate found.
function extractMapCoords(url) {
  if (!url) return null;
  const m = String(url).match(/[?&]q=(-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?)/);
  if (m) return m[1];
  const ll = String(url).match(/(-?\d+\.\d+),(-?\d+\.\d+)/);
  return ll ? ll[1] + ',' + ll[2] : null;
}

// Real Google Maps iframe — directions if both ends supplied, single point otherwise.
// No API key needed (uses the public maps.google.com embed).
const RouteMap = ({ origin, destination, height=200, label }) => {
  const a = extractMapCoords(origin);
  const b = extractMapCoords(destination);
  if (!a && !b) return <MapStub label={label || "แผนที่"}/>;

  const src = (a && b)
    ? `https://maps.google.com/maps?saddr=${encodeURIComponent(a)}&daddr=${encodeURIComponent(b)}&output=embed`
    : `https://maps.google.com/maps?q=${encodeURIComponent(a || b)}&z=15&output=embed`;

  const openHref = (a && b)
    ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(a)}&destination=${encodeURIComponent(b)}&travelmode=driving`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a || b)}`;

  return (
    <div style={{borderRadius:10, border:"1px solid var(--line)", overflow:"hidden", position:"relative"}}>
      <iframe
        src={src}
        width="100%"
        height={height}
        style={{border:0, display:"block"}}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        title="route map"
      />
      <a href={openHref} target="_blank" rel="noopener" style={{
        position:"absolute", top:8, right:8,
        background:"#fff", color:"var(--blue-700)", textDecoration:"none",
        padding:"6px 12px", borderRadius:999, boxShadow:"var(--shadow-sm)",
        fontSize:12, fontWeight:600, display:"inline-flex", alignItems:"center", gap:6,
        border:"1px solid var(--line)",
      }}>
        <Ico.Link/> เปิด Google Maps
      </a>
    </div>
  );
};

Object.assign(window, { Shell, Btn, Card, Field, Input, Textarea, StatusBadge, Stepper, MapStub, RouteMap, NavBtn });
