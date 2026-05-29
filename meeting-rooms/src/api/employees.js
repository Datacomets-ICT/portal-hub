import { supabase } from '../lib/supabase';

// The underlying `employees` table has RLS that denies anon SELECT (only the
// login RPC reads it directly). The `list_active_employees` RPC is a
// security-definer wrapper that exposes a safe subset to anon — that's what
// we use here so nickname / position resolve on the public meeting page.
export async function fetchEmployees() {
  const { data, error } = await supabase.rpc('list_active_employees');
  if (error) throw error;
  return (data || []).map((e) => ({
    code: e.employee_id,
    name: [e.first_name, e.last_name].filter(Boolean).join(' ').trim(),
    nickname: e.nickname,
    dept: e.department,
    position: e.job_position,
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
