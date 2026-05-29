import { supabase } from '../lib/supabase';

// The underlying `employees` table denies anon SELECT (password column).
// Use list_employees_public — a SECURITY DEFINER RPC that returns the full
// roster (including resigned / non-directory staff) with only safe columns,
// so legacy bookings from former employees still resolve nickname/position.
export async function fetchEmployees() {
  const { data, error } = await supabase.rpc('list_employees_public');
  if (error) throw error;
  return (data || []).map((e) => ({
    code: e.employee_id,
    name: [e.first_name, e.last_name].filter(Boolean).join(' ').trim(),
    nickname: e.nickname,
    dept: e.department,
    position: e.position,
  }));
}

export async function fetchEmployeeByCode(code) {
  const { data, error } = await supabase
    .from('mtg_employees')
    .select('*')
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  return data;
}
