// =============================================================================
// LiveDriversScreen — single-page dashboard with all in-progress trips
// =============================================================================
// Everyone (booker + admin) can open this from the topbar to see every
// driver currently on a trip, on one shared Leaflet map plus a list
// underneath. Click a row → map zooms to that driver's pin.
//
// Polls drv_active_trips every 10s. Light enough that the open tab on
// every desk is fine.

const LiveDriversScreen = ({ setPage }) => {
  const [trips, setTrips] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState(null);
  const mapElRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const markersRef = React.useRef({});  // booking_no → leaflet marker

  // ───────── Fetch ─────────
  const reload = React.useCallback(async () => {
    try {
      const { data, error } = await window.sb.rpc('drv_active_trips');
      if (error) throw error;
      setTrips(data || []);
    } catch (e) {
      console.warn('drv_active_trips failed:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    reload();
    const t = setInterval(reload, 10_000);
    return () => clearInterval(t);
  }, [reload]);

  // ───────── Map init + marker sync ─────────
  React.useEffect(() => {
    if (!mapElRef.current || typeof window.L === 'undefined') return;
    const L = window.L;
    if (!mapRef.current) {
      // Default center: Bangkok-ish (Comets HQ area)
      mapRef.current = L.map(mapElRef.current, { zoomControl: true, attributionControl: false })
        .setView([13.6892, 100.6448], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 })
        .addTo(mapRef.current);
    }
  }, []);

  React.useEffect(() => {
    if (!mapRef.current || typeof window.L === 'undefined') return;
    const L = window.L;

    // Build a label icon factory — colored dot + driver name pill
    function makeIcon(label, color) {
      return L.divIcon({
        className: 'drv-live-marker',
        html: `<div style="display:flex;flex-direction:column;align-items:center;">
                 <div style="background:${color};color:#fff;padding:3px 10px;border-radius:999px;font-weight:600;font-size:11px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.25);font-family:'IBM Plex Sans Thai','Inter',sans-serif;">${label}</div>
                 <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${color};margin-top:-1px;"></div>
               </div>`,
        iconSize: [80, 32],
        iconAnchor: [40, 32],
      });
    }

    const seen = new Set();

    // Add / update markers from current trip list
    trips.forEach((t) => {
      if (t.lat == null || t.lng == null) return;   // driver not sharing yet
      seen.add(t.booking_no);
      // Color reflects how far along the trip is — picked_up is the
      // earlier stage (blue), on_the_way is later (green = closer to
      // delivery). Matches the new ops order in screens-track.
      const color = t.trip_status === 'on_the_way' ? '#16a34a' : '#2563eb';
      const label = (t.driver_name || t.driver_no || '?') + ' · ' + (t.car_plate || '');
      const ll = [t.lat, t.lng];

      if (markersRef.current[t.booking_no]) {
        // Move existing
        const m = markersRef.current[t.booking_no];
        m.setLatLng(ll);
        m.setIcon(makeIcon(label, color));
      } else {
        // Create new
        const m = L.marker(ll, { icon: makeIcon(label, color) }).addTo(mapRef.current);
        m.on('click', () => setSelected(t.booking_no));
        markersRef.current[t.booking_no] = m;
      }
    });

    // Remove markers for trips that are no longer active
    Object.keys(markersRef.current).forEach((no) => {
      if (!seen.has(no)) {
        markersRef.current[no].remove();
        delete markersRef.current[no];
      }
    });

    // Auto-fit bounds the first time we have markers
    if (Object.keys(markersRef.current).length > 0 && !mapRef.current._fittedOnce) {
      const group = L.featureGroup(Object.values(markersRef.current));
      mapRef.current.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 14 });
      mapRef.current._fittedOnce = true;
    }
  }, [trips]);

  // Cleanup
  React.useEffect(() => () => {
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    markersRef.current = {};
  }, []);

  // Click row → zoom map to that pin
  function focusTrip(t) {
    setSelected(t.booking_no);
    if (t.lat != null && t.lng != null && mapRef.current) {
      mapRef.current.flyTo([t.lat, t.lng], 16, { duration: 0.6 });
    }
  }

  const withGps = trips.filter((t) => t.lat != null);
  const withoutGps = trips.filter((t) => t.lat == null);

  return (
    <div>
      <div style={{marginBottom:18}}>
        <button onClick={() => setPage({name:"home"})} style={{background:"none", border:"none", cursor:"pointer", color:"var(--ink-3)", fontSize:13, display:"inline-flex", alignItems:"center", gap:4, padding:0, marginBottom:8}}>
          <Ico.ArrowLeft/> หน้าแรก
        </button>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-end", gap:20, flexWrap:"wrap"}}>
          <div>
            <h1 style={{margin:0, fontSize:26, letterSpacing:"-.01em"}}>🛰️ Live Drivers</h1>
            <p style={{margin:"4px 0 0", color:"var(--ink-3)", fontSize:14}}>
              ดู trip ที่กำลังวิ่งอยู่ตอนนี้ — auto-refresh ทุก 10 วินาที
            </p>
          </div>
          <div style={{display:"flex", gap:14, alignItems:"center"}}>
            <Stat label="กำลังวิ่ง" n={trips.length} color="var(--blue-600)"/>
            <Stat label="แชร์ตำแหน่ง" n={withGps.length} color="var(--ok)"/>
          </div>
        </div>
      </div>

      {/* Map */}
      <Card style={{padding:0, overflow:"hidden", marginBottom:16}}>
        <div ref={mapElRef} style={{
          height:420, background:"repeating-linear-gradient(45deg,#f1f5ff 0 8px,#e8eefd 8px 16px)",
        }}/>
      </Card>

      {loading ? (
        <Card style={{padding:40, textAlign:"center", color:"var(--ink-3)"}}>กำลังโหลด…</Card>
      ) : trips.length === 0 ? (
        <Card style={{padding:60, textAlign:"center"}}>
          <div style={{fontSize:36, color:"var(--muted)", marginBottom:8}}>🚗</div>
          <div style={{fontWeight:600, marginBottom:4}}>ตอนนี้ยังไม่มี trip ที่กำลังวิ่ง</div>
          <div style={{color:"var(--ink-3)", fontSize:13}}>เมื่อคนขับกด "ออกแล้ว" trip จะปรากฏที่นี่</div>
        </Card>
      ) : (
        <Card style={{padding:0, overflow:"hidden"}}>
          <div style={{padding:"14px 20px", borderBottom:"1px solid var(--line)", fontSize:14, fontWeight:600}}>
            🚗 รายการ trip ที่กำลังวิ่ง ({trips.length})
          </div>
          <div>
            {trips.map((t) => (
              <TripRow key={t.booking_no} t={t}
                       selected={selected === t.booking_no}
                       onClick={() => focusTrip(t)}/>
            ))}
          </div>
          {withoutGps.length > 0 && (
            <div style={{padding:"10px 20px", borderTop:"1px dashed var(--line)", fontSize:11.5, color:"var(--ink-3)", background:"var(--surface-2)"}}>
              ⓘ {withoutGps.length} trip ยังไม่ได้แชร์ตำแหน่ง — คนขับต้องกด "เริ่มแชร์ตำแหน่ง" ในหน้า booking
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

const Stat = ({ label, n, color }) => (
  <div style={{padding:"8px 16px", borderRadius:10, background:"#fff", border:"1px solid var(--line)", textAlign:"center", minWidth:70}}>
    <div style={{fontSize:22, fontWeight:700, color}}>{n}</div>
    <div style={{fontSize:11, color:"var(--ink-3)", marginTop:-2}}>{label}</div>
  </div>
);

const TripRow = ({ t, selected, onClick }) => {
  const stColor = t.trip_status === 'on_the_way' ? '#16a34a' : '#2563eb';
  const stLabel = t.trip_status === 'picked_up' ? '🙋 รับแล้ว' : '🚗 ออกแล้ว';
  const ageStr = t.loc_age_seconds == null
    ? null
    : t.loc_age_seconds < 60
      ? `${t.loc_age_seconds}วิ`
      : `${Math.floor(t.loc_age_seconds / 60)}น.`;
  return (
    <div onClick={onClick} style={{
      padding:"14px 20px", borderBottom:"1px solid var(--line-2)", cursor:"pointer",
      background: selected ? "var(--blue-50)" : "transparent",
      borderLeft: selected ? "3px solid var(--blue-600)" : "3px solid transparent",
      transition:"background .12s",
      display:"grid", gridTemplateColumns:"auto 1fr auto", gap:14, alignItems:"center",
    }}
    onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = "var(--surface-2)"; }}
    onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "transparent"; }}>
      <div style={{
        width:36, height:36, borderRadius:"50%", background:"var(--blue-50)",
        display:"grid", placeItems:"center", color:"var(--blue-700)", fontWeight:700, fontSize:13,
      }}>{(t.driver_name || '?').charAt(0)}</div>
      <div style={{minWidth:0}}>
        <div style={{display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:2}}>
          <b style={{fontSize:14}}>{t.driver_name || t.driver_no || '(ยังไม่ระบุ)'}</b>
          {t.car_plate && <span className="mono" style={{fontSize:11, color:"var(--ink-3)"}}>{t.car_plate}</span>}
          <span style={{fontSize:11, padding:"2px 8px", borderRadius:999, background: stColor + '20', color: stColor, fontWeight:600}}>{stLabel}</span>
        </div>
        <div style={{fontSize:13, color:"var(--ink-2)"}}>
          {t.pickup_name || '?'} → {t.dropoff_name || '?'}
        </div>
        <div style={{fontSize:11, color:"var(--ink-3)", marginTop:2}}>
          จองโดย {t.employee_name || t.employee_id} · {t.booking_no}
        </div>
      </div>
      <div style={{textAlign:"right", fontSize:11, color:"var(--ink-3)"}}>
        {ageStr ? (
          <>
            <div style={{color:"var(--ok)", fontWeight:600}}>📍 {ageStr}</div>
            <div>ก่อน</div>
          </>
        ) : (
          <div style={{color:"var(--warn)"}}>ไม่มีตำแหน่ง</div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { LiveDriversScreen });
