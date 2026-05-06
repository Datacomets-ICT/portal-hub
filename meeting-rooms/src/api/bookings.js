import { supabase } from '../lib/supabase';

function fromRow(row) {
  return {
    id: row.id,
    roomId: row.room_id,
    bookingDate: row.booking_date,
    start: row.start_min,
    end: row.end_min,
    title: row.title,
    booker: row.booker,
    attendees: row.attendees,
    purpose: row.purpose,
    company: row.company,
    customerCount: row.customer_count,
    equipment: row.equipment || [],
    refreshments: row.refreshments || [],
  };
}

function toRow(obj) {
  return {
    room_id: obj.roomId,
    booking_date: obj.bookingDate,
    start_min: obj.start,
    end_min: obj.end,
    title: obj.title,
    booker: obj.booker ?? null,
    attendees: obj.attendees ?? null,
    purpose: obj.purpose ?? null,
    company: obj.company || null,
    customer_count: obj.customerCount ?? null,
    equipment: obj.equipment || [],
    refreshments: obj.refreshments || [],
  };
}

export async function fetchBookingsByDateRange(startDate, endDate) {
  const { data, error } = await supabase
    .from('mtg_bookings')
    .select('*')
    .gte('booking_date', startDate)
    .lte('booking_date', endDate)
    .order('booking_date')
    .order('start_min');
  if (error) throw error;
  return data.map(fromRow);
}

export async function fetchBookingsByBooker(bookerName, limit = 300) {
  const { data, error } = await supabase
    .from('mtg_bookings')
    .select('*')
    .eq('booker', bookerName)
    .order('booking_date', { ascending: false })
    .order('start_min', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map(fromRow);
}

export async function fetchBookingsForAnalytics({ startDate, endDate, limit = 5000 } = {}) {
  let q = supabase.from('mtg_bookings').select('*').limit(limit);
  if (startDate) q = q.gte('booking_date', startDate);
  if (endDate) q = q.lte('booking_date', endDate);
  q = q.order('booking_date', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data.map(fromRow);
}

// Fetch the N most-recent bookings (across all users).
// Used by the "ประวัติการจอง" tab.
export async function fetchRecentBookings({ limit = 500 } = {}) {
  const { data, error } = await supabase
    .from('mtg_bookings')
    .select('*')
    .order('booking_date', { ascending: false })
    .order('start_min', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map(fromRow);
}

// Paginate past Supabase's default 1000-row cap.
// Used by Dashboard which needs the full history for overall metrics.
export async function fetchAllBookings({ pageSize = 1000, maxRows = 20000 } = {}) {
  const all = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await supabase
      .from('mtg_bookings')
      .select('*')
      .order('booking_date', { ascending: false })
      .order('start_min', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all.map(fromRow);
}

export async function insertBooking(obj) {
  const { data, error } = await supabase
    .from('mtg_bookings')
    .insert(toRow(obj))
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
}

export async function updateBooking(id, obj) {
  const { data, error } = await supabase
    .from('mtg_bookings')
    .update(toRow(obj))
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
}

export async function deleteBooking(id) {
  const { error } = await supabase.from('mtg_bookings').delete().eq('id', id);
  if (error) throw error;
}
