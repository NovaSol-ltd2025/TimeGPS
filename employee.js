import { supabaseAdmin } from './supabaseAdmin';
import { bangkokDateStr, bangkokTodayRangeUtc } from './utils';

// Returns { status: 'success', empName, department, lastStatus }
// or { status: 'error', message }
export async function verifyEmployee(empId, pin) {
  empId = (empId || '').toString().trim();
  pin = (pin || '').toString().trim();

  const { data: emp, error } = await supabaseAdmin
    .from('employees')
    .select('*')
    .eq('emp_id', empId)
    .maybeSingle();

  if (error) {
    return { status: 'error', message: 'ข้อผิดพลาดฐานข้อมูล: ' + error.message };
  }
  if (!emp) {
    return { status: 'error', message: '❌ ไม่พบข้อมูลรหัสพนักงานนี้ในระบบ' };
  }
  if (emp.pin.toString().trim() !== pin) {
    return { status: 'error', message: '❌ รหัส PIN 4 หลักไม่ถูกต้อง โปรดลองอีกครั้ง' };
  }
  if (emp.status !== 'Active') {
    return { status: 'error', message: '❌ รหัสพนักงานนี้ถูกระงับสิทธิ์การใช้งานชั่วคราว' };
  }

  const lastStatus = await getTodayLastStatus(empId);

  return {
    status: 'success',
    empName: emp.name,
    department: emp.department,
    branch: emp.branch || '',
    lastStatus
  };
}

export async function getTodayLastStatus(empId) {
  const [startIso, endIso] = bangkokTodayRangeUtc();

  const { data, error } = await supabaseAdmin
    .from('attendance')
    .select('type, created_at')
    .eq('emp_id', empId)
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return 'NONE';
  return data[0].type;
}

export { bangkokDateStr };
