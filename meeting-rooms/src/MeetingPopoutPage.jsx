// MeetingPopoutPage — renders the MeetingRoomPanel as a standalone page
// in its own window/tab so the user can navigate the main app without
// losing the meeting window. Mounted from App.jsx when `?room=<bookingId>`
// is present in the URL.
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase.js';
import MeetingRoomPanel from './MeetingRoomPanel.jsx';

function readUser() {
  try {
    const raw = localStorage.getItem('mr_user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export default function MeetingPopoutPage({ bookingId }) {
  const [state, setState] = useState({ loading: true, booking: null, room: null, error: null });
  const currentUser = readUser();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [bRes, rRes] = await Promise.all([
          supabase.from('mtg_bookings').select('*').eq('id', bookingId).maybeSingle(),
          // pull all rooms once — small table
          supabase.from('mtg_rooms').select('*'),
        ]);
        if (bRes.error) throw bRes.error;
        if (rRes.error) throw rRes.error;
        if (!bRes.data) throw new Error('ไม่พบการประชุมนี้');
        const room = (rRes.data || []).find((r) => r.id === bRes.data.room_id) || null;
        const booking = {
          id: bRes.data.id,
          roomId: bRes.data.room_id,
          bookingDate: bRes.data.booking_date,
          start: bRes.data.start_min,
          end: bRes.data.end_min,
          title: bRes.data.title,
          booker: bRes.data.booker,
          attendees: bRes.data.attendees,
          purpose: bRes.data.purpose,
          company: bRes.data.company,
          customerCount: bRes.data.customer_count,
          equipment: bRes.data.equipment || [],
          refreshments: bRes.data.refreshments || [],
          agenda: bRes.data.agenda || [],
          autoSummary: bRes.data.auto_summary || null,
          autoSummaryAt: bRes.data.auto_summary_at || null,
          endedAt: bRes.data.ended_at || null,
        };
        if (alive) setState({ loading: false, booking, room, error: null });
      } catch (err) {
        if (alive) setState({ loading: false, booking: null, room: null, error: err.message || String(err) });
      }
    })();
    return () => { alive = false; };
  }, [bookingId]);

  if (!currentUser) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'inherit' }}>
        กรุณา login ในแท็บหลักก่อน แล้ว refresh แท็บนี้
      </div>
    );
  }
  if (state.loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}>กำลังโหลดการประชุม...</div>;
  }
  if (state.error) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'crimson' }}>{state.error}</div>;
  }

  return (
    <MeetingRoomPanel
      booking={state.booking}
      room={state.room}
      currentUser={currentUser}
      onClose={() => window.close()}
      popout
    />
  );
}
