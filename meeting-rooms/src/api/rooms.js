import { supabase } from '../lib/supabase';

export async function fetchRooms() {
  const { data, error } = await supabase.from('rooms').select('*').order('id');
  if (error) throw error;
  return data;
}

export async function updateRoom(id, updates) {
  const { data, error } = await supabase
    .from('rooms')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function insertRoom(row) {
  const { data, error } = await supabase
    .from('rooms')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRoom(id) {
  const { error } = await supabase.from('rooms').delete().eq('id', id);
  if (error) throw error;
  // Best-effort photo cleanup — ignore failures (bucket may not exist yet, file may not be present).
  try {
    await supabase.storage
      .from('room-photos')
      .remove([`${id}.jpg`, `${id}.jpeg`, `${id}.png`, `${id}.webp`]);
  } catch (_) {
    // ignore
  }
}
