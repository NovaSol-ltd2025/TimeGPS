import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from './supabaseAdmin';
import { bangkokTodayRangeUtc } from './utils';

function normalize(value) { return (value || '').toString().trim(); }

// PINs created by older versions were plaintext. They are accepted once and
// transparently upgraded to bcrypt; new PINs must always be bcrypt hashes.
async function pinMatches(stored, supplied, empId) {
  const value = normalize(stored);
  if (value.startsWith('$2a$') || value.startsWith('$2b$') || value.startsWith('$2y$')) {
    return bcrypt.compare(supplied, value);
  }
  const matches = value === supplied;
  if (matches) {
    const hash = await bcrypt.hash(supplied, 12);
    await supabaseAdmin.from('employees').update({ pin: hash }).eq('emp_id', empId);
  }
  return matches;
}

export async function verifyEmployee(empId, pin) {
  empId = normalize(empId).toUpperCase();
  pin = normalize(pin);
  const { data: emp, error } = await supabaseAdmin.from('employees').select('emp_id,name,department,branch,pin,status').eq('emp_id', empId).maybeSingle();
  if (error) return { status: 'error', message: 'ข้อผิดพลาดฐานข้อมูล: ' + error.message };
  if (!emp) return { status: 'error', message: '❌ ไม่พบข้อมูลรหัสพนักงานนี้ในระบบ' };
  if (!(await pinMatches(emp.pin, pin, emp.emp_id))) return { status: 'error', message: '❌ รหัส PIN ไม่ถูกต้อง โปรดลองอีกครั้ง' };
  if (emp.status !== 'Active') return { status: 'error', message: '❌ รหัสพนักงานนี้ถูกระงับสิทธิ์การใช้งานชั่วคราว' };
  const lastStatus = await getTodayLastStatus(empId);
  return { status: 'success', empName: emp.name, department: emp.department, branch: emp.branch || '', lastStatus };
}

export async function getTodayLastStatus(empId) {
  const [startIso, endIso] = bangkokTodayRangeUtc();
  const { data, error } = await supabaseAdmin.from('attendance').select('type,created_at').eq('emp_id', empId).gte('created_at', startIso).lt('created_at', endIso).order('created_at', { ascending: false }).limit(1);
  if (error || !data?.length) return 'NONE';
  return data[0].type;
}

export { bangkokDateStr } from './utils';
