// Track bookings list + detail
const { useState: uST } = React;

const TrackScreen = ({ setPage, empId, password, bookings, detailId, onReload, openChat }) => {
  const mine = bookings.filter(b => b.employee && b.employee.id === empId);
  if (detailId) {
    const b = bookings.find(x => x.id === detailId);
    if (b) return <BookingDetail b={b} empId={empId} password={password} onReload={onReload} openChatInitial={!!openChat} back={()=>setPage({name:"track"})}/>;
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

const BookingDetail = ({ b, back, empId, password, onReload, openChatInitial }) => {
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
      <div style={{display:"flex", gap:10, alignItems:"center"}}>
        <StatusBadge s={b.status}/>
        <button onClick={()=>setChatOpen(true)}
          style={{padding:"8px 14px", border:"1px solid var(--blue-600)", background:"var(--blue-50)", color:"var(--blue-700)",
                  borderRadius:8, fontSize:13, fontWeight:600, fontFamily:"inherit", cursor:"pointer",
                  display:"inline-flex", alignItems:"center", gap:6}}>
          💬 แชทกับ Admin
        </button>
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

Object.assign(window, { TrackScreen });
