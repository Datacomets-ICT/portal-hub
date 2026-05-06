import { supabase } from '../lib/supabase';

export async function fetchEmployees() {
  const { data, error } = await supabase.from('employees').select('*').order('code');
  if (error) throw error;
  return data;
}

export async function fetchEmployeeByCode(code) {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  return data;
}
