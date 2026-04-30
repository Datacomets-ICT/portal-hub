// Booking chat — slide-out panel for user ↔ admin messaging on a single
// booking. Used by both BookingDetail (user view) and AdminDetail.
//
// Polls every 5s while the panel is open; reloads immediately after send.
// No Supabase Realtime subscription yet — just polling, simple + reliable.

const { useState: uSC, useEffect: uEC, useRef: uRC } = React;

const BookingChat = ({ bookingKey, bookingNo, empId, password, isAdmin, onClose }) => {
  const [msgs, setMsgs]     = uSC([]);
  const [text, setText]     = uSC('');
  const [busy, setBusy]     = uSC(false);
  const [error, setError]   = uSC('');
  const [loading, setLoading] = uSC(true);
  const bodyRef = uRC(null);

  const fetchMsgs = React.useCallback(async () => {
    try {
      const { data, error: err } = await window.sb.rpc('drv_get_messages', {
        p_emp_id: empId, p_password: password, p_booking_key: bookingKey,
      });
      if (err) throw err;
      if (!data || !data.success) throw new Error(data?.message || 'โหลดไม่สำเร็จ');
      const list = data.messages || [];
      setMsgs(list);
      setError('');
      // Mark this booking's chat as "seen up to" the latest message
      const latest = list.length ? list[list.length - 1].created_at : null;
      if (latest) markBookingSeen(bookingKey, latest);
    } catch (e) {
      setError(e.message || 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }, [empId, password, bookingKey]);

  // Initial load + poll every 5s while panel open
  uEC(() => {
    fetchMsgs();
    const t = setInterval(fetchMsgs, 5000);
    return () => clearInterval(t);
  }, [fetchMsgs]);

  // Auto-scroll to bottom on new messages
  uEC(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [msgs.length]);

  // ESC to close
  uEC(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const { data, error: err } = await window.sb.rpc('drv_send_message', {
        p_emp_id: empId, p_password: password, p_booking_key: bookingKey, p_body: body,
      });
      if (err) throw err;
      if (!data || !data.success) throw new Error(data?.message || 'ส่งไม่สำเร็จ');
      setText('');
      await fetchMsgs();
    } catch (e) {
      setError(e.message || 'เกิดข้อผิดพลาด');
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      <div onClick={onClose} style={{
        position:"fixed", inset:0, background:"rgba(15,23,42,.4)",
        backdropFilter:"blur(2px)", zIndex:50, animation:"fadeIn .15s ease",
      }}/>
      <div style={{
        position:"fixed", top:0, right:0, bottom:0, width:"100%", maxWidth:440,
        background:"#fff", zIndex:51, display:"flex", flexDirection:"column",
        boxShadow:"-12px 0 32px rgba(0,0,0,.18)",
        animation:"slideInLeft .2s cubic-bezier(.2,.7,.2,1)",
      }}>
        {/* Header */}
        <div style={{
          padding:"16px 20px", borderBottom:"1px solid var(--line)",
          display:"flex", alignItems:"center", gap:12, background:"var(--blue-50)",
        }}>
          <div style={{width:38, height:38, borderRadius:10, background:"var(--blue-600)", color:"#fff", display:"grid", placeItems:"center"}}>
            💬
          </div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700, fontSize:14}}>แชทกับ {isAdmin ? "ผู้แจ้ง" : "Admin"}</div>
            <div className="mono" style={{fontSize:11, color:"var(--ink-3)"}}>{bookingNo}</div>
          </div>
          <button onClick={onClose} style={{
            border:"none", background:"transparent", cursor:"pointer",
            fontSize:22, color:"var(--ink-3)", padding:"4px 10px",
          }}>×</button>
        </div>

        {/* Body */}
        <div ref={bodyRef} style={{
          flex:1, overflowY:"auto", padding:"18px 20px",
          background:"var(--surface-2)",
          display:"flex", flexDirection:"column", gap:10,
        }}>
          {loading ? (
            <div style={{textAlign:"center", color:"var(--ink-3)", fontSize:13, padding:20}}>กำลังโหลด…</div>
          ) : msgs.length === 0 ? (
            <div style={{textAlign:"center", color:"var(--ink-3)", fontSize:13, padding:30}}>
              <div style={{fontSize:32, marginBottom:8}}>💬</div>
              ยังไม่มีข้อความ — เริ่มสนทนาได้เลย
            </div>
          ) : (
            msgs.map(m => <ChatBubble key={m.id} m={m} mine={m.sender_id === empId}/>)
          )}
          {error ? (
            <div style={{
              marginTop:8, padding:"8px 12px", borderRadius:8,
              background:"#FEE2E2", color:"#991B1B", fontSize:12, fontWeight:500,
            }}>⚠️ {error}</div>
          ) : null}
        </div>

        {/* Composer */}
        <div style={{
          padding:"14px 16px", borderTop:"1px solid var(--line)", background:"#fff",
          display:"flex", gap:8, alignItems:"flex-end",
        }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="พิมพ์ข้อความ… (Enter เพื่อส่ง · Shift+Enter ขึ้นบรรทัดใหม่)"
            disabled={busy}
            style={{
              flex:1, padding:"10px 12px", border:"1px solid var(--line)",
              borderRadius:10, fontFamily:"inherit", fontSize:14, resize:"none",
              minHeight:42, maxHeight:120, background:"#fff",
            }}
            rows={1}
          />
          <button onClick={send} disabled={busy || !text.trim()} style={{
            padding:"10px 16px", border:"none", borderRadius:10,
            background: (busy || !text.trim()) ? "var(--line)" : "var(--blue-600)",
            color:"#fff", fontWeight:600, fontSize:14, cursor: (busy || !text.trim()) ? "default" : "pointer",
            fontFamily:"inherit", flexShrink:0,
          }}>
            {busy ? '…' : 'ส่ง'}
          </button>
        </div>
      </div>
    </>
  );
};

const ChatBubble = ({ m, mine }) => {
  const isAdmin = m.sender_role === 'admin';
  const time = m.created_at ? new Date(m.created_at).toLocaleString('sv-SE').slice(0, 16) : '';
  return (
    <div style={{display:"flex", flexDirection:"column", alignItems: mine ? "flex-end" : "flex-start"}}>
      <div style={{
        fontSize:11, color:"var(--ink-3)", marginBottom:3, padding:"0 4px",
        display:"flex", gap:6, alignItems:"center",
      }}>
        <b style={{color: isAdmin ? "var(--blue-700)" : "var(--ink-2)"}}>{m.sender_name}</b>
        {isAdmin ? (
          <span style={{fontSize:9, padding:"1px 6px", borderRadius:999, background:"var(--blue-600)", color:"#fff", fontWeight:700, letterSpacing:.4}}>ADMIN</span>
        ) : null}
        <span className="mono" style={{fontSize:10}}>{time}</span>
      </div>
      <div style={{
        maxWidth:"85%", padding:"10px 14px", borderRadius:14,
        background: mine ? "var(--blue-600)" : "#fff",
        color: mine ? "#fff" : "var(--ink)",
        border: mine ? "none" : "1px solid var(--line)",
        whiteSpace:"pre-wrap", wordBreak:"break-word", lineHeight:1.5, fontSize:14,
        boxShadow: mine ? "0 1px 2px rgba(30,76,189,.2)" : "var(--shadow-sm)",
      }}>{m.body}</div>
    </div>
  );
};

Object.assign(window, { BookingChat });
