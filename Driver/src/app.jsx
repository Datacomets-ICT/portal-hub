// Root app — begins at login; reveals main app after verify.
const { useState: uSA, useEffect: uEA } = React;

// SSO from portal hub: if the user came in via /hub, sessionStorage.ticketUser
// (set by portal's auth) carries their identity. We use the portal's password
// from sessionStorage too so we can call Supabase RPCs without a re-login.
const PORTAL_USER = (function () {
  try {
    var raw = sessionStorage.getItem('ticketUser') || localStorage.getItem('mr_user');
    if (!raw) return null;
    var u = JSON.parse(raw);
    var empId = u.employeeId || u.code;
    if (!empId) return null;
    var fullName = u.firstName
      ? [u.firstName, u.lastName].filter(Boolean).join(' ')
      : (u.name || u.nickname || empId);
    var role = (u.role || 'user').toLowerCase();
    var isAdmin = !!u.isAdmin || ['manager','senior_manager','officer','system'].indexOf(role) !== -1;
    return {
      id: String(empId),
      name: fullName,
      dept: u.department || u.dept || u.section || '-',
      phone: u.phone || '',
      role: role,
      isAdmin: isAdmin,
    };
  } catch (_) {
    return null;
  }
})();
const PORTAL_PWD = (function() {
  try { return sessionStorage.getItem('ticketPwd') || ''; } catch(_) { return ''; }
})();
if (PORTAL_USER && !EMPLOYEES.find(function (e) { return e.id === PORTAL_USER.id; })) {
  EMPLOYEES.unshift(PORTAL_USER);
}

function App() {
  const [verified, setVerified] = uSA(!!PORTAL_USER);
  const [page, setPage] = uSA({name:"home"});
  const [empId, setEmpId] = uSA(PORTAL_USER ? PORTAL_USER.id : "");
  const [bookings, setBookings] = uSA([]);
  const [dataReady, setDataReady] = uSA(false);
  const [pendingCount, setPendingCount] = uSA(0);
  const [toasts, setToasts] = uSA([]);   // [{id, name, route}]
  const seenRef = React.useRef(null);    // Set<booking_no> we've already seen (admin)
  const password = PORTAL_PWD;
  const isAdmin = !!(PORTAL_USER && PORTAL_USER.isAdmin);

  // Load master data (places / cars / drivers) once
  uEA(() => {
    loadDriverData().finally(() => setDataReady(true));
  }, []);

  // Reload bookings whenever we have an empId (login or after submit)
  const reloadBookings = React.useCallback(async () => {
    if (!empId) return;
    const list = await fetchMyBookings(empId, password);
    setBookings(list);
  }, [empId, password]);

  uEA(() => { reloadBookings(); }, [reloadBookings]);

  // User: poll every 15s for new chat messages on MY bookings.
  // (Admin gets the same chat-toast via the new-booking poll below since
  //  drv_get_all_bookings now returns last_message_at too.)
  const userMsgSeenRef = React.useRef(null);
  uEA(() => {
    if (!empId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const list = await fetchMyBookings(empId, password);
        if (cancelled) return;
        // first poll → seed, no toast
        if (userMsgSeenRef.current === null) {
          userMsgSeenRef.current = new Map(list.map(b => [b.key, b.lastMessageAt || '']));
          setBookings(list);
          return;
        }
        const seen = userMsgSeenRef.current;
        const fresh = list.filter(b => {
          if (!b.lastMessageAt) return false;
          if (b.lastMessageRole === 'user') return false;          // I sent it
          const prev = seen.get(b.key) || '';
          return b.lastMessageAt > prev;
        });
        fresh.forEach(b => {
          const id = 'msg_' + b.id + '_' + Date.now();
          setToasts(t => [...t, {
            id, bookingNo: b.id,
            kind: 'msg',
            name: 'Admin',
            route: `${b.pickup.name} → ${b.dropoff.name}`,
            bookingKey: b.key,
          }]);
          setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 8000);
        });
        // refresh seen map
        list.forEach(b => seen.set(b.key, b.lastMessageAt || ''));
        setBookings(list);
      } catch (_) { /* ignore */ }
    };
    poll();
    const t = setInterval(poll, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, [empId, password]);

  // Admin: poll every 15s for new bookings AND new user→admin chat
  // messages on any booking. Drives the nav badge + top-right toasts.
  const adminMsgSeenRef = React.useRef(null);
  uEA(() => {
    if (!isAdmin || !empId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const { data, error } = await window.sb.rpc('drv_get_all_bookings', {
          p_emp_id: empId, p_password: password,
        });
        if (cancelled || error || !data || !data.success) return;
        const all = data.bookings || [];
        const pending = all.filter(b => b.status === 'pending');
        setPendingCount(pending.length);

        // First poll → just record what's already there, don't toast
        if (seenRef.current === null) {
          seenRef.current = new Set(all.map(b => b.booking_no));
          adminMsgSeenRef.current = new Map(all.map(b => [b.key, b.last_message_at || '']));
          return;
        }

        // ---- new bookings ----
        const seen = seenRef.current;
        const fresh = all.filter(b => !seen.has(b.booking_no));
        fresh.forEach(b => {
          seen.add(b.booking_no);
          const route = `${b.pickup_name || '-'} → ${b.dropoff_name || '-'}`;
          const id = b.booking_no + '_' + Date.now();
          setToasts(t => [...t, {
            id, bookingNo: b.booking_no, kind: 'booking',
            name: b.employee_name || b.employee_id || 'พนักงาน',
            route,
          }]);
          setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 7000);
        });

        // ---- new user→admin chat messages ----
        const msgSeen = adminMsgSeenRef.current;
        all.forEach(b => {
          if (!b.last_message_at) return;
          if (b.last_message_role !== 'user') return;   // only highlight user msgs
          const prev = msgSeen.get(b.key) || '';
          if (b.last_message_at > prev && prev !== '') {  // skip first-poll seed
            const id = 'msg_' + b.booking_no + '_' + Date.now();
            const route = `${b.pickup_name || '-'} → ${b.dropoff_name || '-'}`;
            setToasts(t => [...t, {
              id, bookingNo: b.booking_no, kind: 'msg',
              name: b.employee_name || b.employee_id || 'ผู้แจ้ง',
              route,
              bookingKey: b.key,
            }]);
            setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 8000);
          }
          msgSeen.set(b.key, b.last_message_at || '');
        });
      } catch (_) { /* swallow — next poll will retry */ }
    };

    poll();
    const t = setInterval(poll, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, [isAdmin, empId, password]);

  // After a successful create_booking, refresh from server
  const onComplete = () => { reloadBookings(); };

  const logout = () => { setVerified(false); setEmpId(""); setPage({name:"home"}); };
  const dismissToast = (id) => setToasts(t => t.filter(x => x.id !== id));

  if (!verified) {
    return <LoginScreen onVerified={(id)=>{ setEmpId(id); setVerified(true); setPage({name:"home"}); }}/>;
  }

  return (
    <Shell page={page} setPage={setPage} empId={empId} isAdmin={isAdmin} pendingCount={pendingCount} onLogout={logout}>
      {page.name === "home" && <HomeScreen key="home" setPage={setPage} empId={empId} bookings={bookings}/>}
      {page.name === "booking" && (
        <BookingFlow setPage={setPage} empId={empId} password={password} onComplete={onComplete}/>
      )}
      {page.name === "track" && <TrackScreen key={"tr"+(page.id||"list")} setPage={setPage} empId={empId} password={password} bookings={bookings} detailId={page.id} onReload={reloadBookings} openChat={!!page.openChat}/>}
      {page.name === "admin" && isAdmin && <AdminScreen setPage={setPage} empId={empId} password={password} openBookingKey={page.openBookingKey} openChat={!!page.openChat}/>}
      <ToastStack toasts={toasts} dismiss={dismissToast}
        onClick={(t) => {
          if (t.kind === 'msg') {
            // Admin → admin tab, click into the booking. User → track detail.
            if (isAdmin) {
              setPage({name:"admin", openBookingKey: t.bookingKey, openChat: true});
            } else {
              setPage({name:"track", id: t.bookingNo, openChat: true});
            }
          } else {
            setPage({name:"admin"});
          }
        }}/>
    </Shell>
  );
}

// Stack of toasts in the top-right.
//   kind = 'booking' (admin: someone made a new booking)
//   kind = 'msg'     (user/admin: someone sent a chat message)
const ToastStack = ({ toasts, dismiss, onClick }) => {
  if (!toasts || toasts.length === 0) return null;
  return (
    <div style={{position:"fixed", top:16, right:16, display:"flex", flexDirection:"column", gap:10, zIndex:80, maxWidth:360}}>
      {toasts.map(t => {
        const isMsg = t.kind === 'msg';
        return (
        <div key={t.id} style={{
          background:"#fff",
          border: "1px solid " + (isMsg ? "#fecaca" : "var(--blue-200)"),
          borderLeft: "4px solid " + (isMsg ? "#dc2626" : "var(--blue-600)"),
          borderRadius:12, padding:"12px 14px", boxShadow:"var(--shadow-lg)",
          display:"flex", alignItems:"flex-start", gap:10,
          animation:"fadeUp .25s ease",
        }}>
          <div style={{
            width:36, height:36, borderRadius:10,
            background: isMsg ? "#fee2e2" : "var(--blue-50)",
            color:    isMsg ? "#b91c1c" : "var(--blue-700)",
            display:"grid", placeItems:"center", flexShrink:0, fontSize:18,
          }}>{isMsg ? "💬" : "🚗"}</div>
          <button onClick={() => { onClick && onClick(t); dismiss(t.id); }}
            style={{flex:1, textAlign:"left", background:"none", border:"none", padding:0, cursor:"pointer", fontFamily:"inherit"}}>
            <div style={{fontSize:13, fontWeight:600, color:"var(--ink)", marginBottom:2}}>
              {isMsg ? `ข้อความใหม่ · ${t.bookingNo}` : `คำขอใหม่ · ${t.bookingNo}`}
            </div>
            <div style={{fontSize:12, color:"var(--ink-2)"}}><b>{t.name}</b> · {t.route}</div>
            <div style={{fontSize:11, color: isMsg ? "#b91c1c" : "var(--blue-600)", marginTop:4, fontWeight:600}}>
              {isMsg ? "คลิกเพื่อตอบ →" : "คลิกเพื่อจัดการ →"}
            </div>
          </button>
          <button onClick={() => dismiss(t.id)}
            style={{background:"none", border:"none", cursor:"pointer", color:"var(--muted)", fontSize:18, lineHeight:1, padding:"0 4px"}}>×</button>
        </div>
        );
      })}
    </div>
  );
};

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
