import { headers } from 'next/headers';
import { supabaseAdmin } from './supabaseAdmin';
import { bangkokDateStr, bangkokTodayRangeUtc } from './utils';

// ── กันการเดา PIN (brute force) ─────────────────────────────────────────
// PIN มีแค่ 4 หลัก (10,000 แบบ) และรหัสพนักงานเห็นได้จากแดชบอร์ด จึงจำกัดจำนวนครั้ง
// ที่ "ใส่ผิด" ต่อ IP ในช่วง 15 นาที
//   - ผิดเกิน 6 ครั้งกับรหัสพนักงานคนเดียวจาก IP เดียว → IP นั้นถูกบล็อกรหัสนั้น
//   - ผิดรวมเกิน 20 ครั้งจาก IP เดียว (ทุกรหัส)          → IP นั้นถูกบล็อกทั้งหมด
// นับตาม IP (ไม่ใช่ตามรหัสพนักงาน) เพื่อไม่ให้ใครกลั่นแกล้งล็อกบัญชีเพื่อนร่วมงาน
// ที่ใช้เครือข่ายอื่นอยู่ได้ ตารางที่ใช้: pin_attempts (ดู supabase-hardening.sql)
//
// ถ้าตารางยังไม่ถูกสร้างหรือฐานข้อมูลตอบ error ระบบจะ "ปล่อยผ่านและบันทึก log"
// (fail-open) เพื่อไม่ให้พนักงานลงเวลาไม่ได้ จึง deploy ไฟล์นี้ก่อนรัน SQL ได้อย่างปลอดภัย
const THROTTLE_WINDOW_MINUTES = 15;
const MAX_FAILS_PER_IP_AND_EMP = 6;
const MAX_FAILS_PER_IP = 20;
const LOCK_MESSAGE =
  '❌ ใส่รหัสผิดหลายครั้งเกินไป กรุณารอประมาณ 15 นาทีแล้วลองใหม่ หรือติดต่อฝ่ายบุคคล';

// Vercel เป็นผู้ตั้งค่า x-real-ip / x-forwarded-for เอง (ไม่รับค่าที่ผู้ใช้ปลอมมา)
async function getClientIp() {
  try {
    const h = await headers(); // await ใช้ได้ทั้ง Next 14 และ 15
    const real = h.get('x-real-ip');
    if (real) return real.trim();
    const fwd = h.get('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim();
  } catch (e) {
    // เรียกนอก request context — ข้ามการจำกัด
  }
  return null;
}

async function isThrottled(ip, empId) {
  if (!ip) return false;
  try {
    const since = new Date(Date.now() - THROTTLE_WINDOW_MINUTES * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from('pin_attempts')
      .select('emp_id')
      .eq('ip', ip)
      .gte('attempted_at', since);
    if (error) throw error;

    const rows = data || [];
    if (rows.length >= MAX_FAILS_PER_IP) return true;
    return rows.filter((r) => r.emp_id === empId).length >= MAX_FAILS_PER_IP_AND_EMP;
  } catch (e) {
    console.error('[verifyEmployee] throttle check failed (fail-open):', e);
    return false;
  }
}

async function recordFailure(ip, empId) {
  if (!ip) return;
  try {
    await supabaseAdmin.from('pin_attempts').insert({ ip, emp_id: empId.slice(0, 50) });
    // เก็บกวาดแถวเก่าเป็นครั้งคราว (ไม่ต้องมี cron)
    if (Math.random() < 0.05) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await supabaseAdmin.from('pin_attempts').delete().lt('attempted_at', cutoff);
    }
  } catch (e) {
    console.error('[verifyEmployee] record failure failed:', e);
  }
}

async function clearFailures(ip, empId) {
  if (!ip) return;
  try {
    await supabaseAdmin.from('pin_attempts').delete().eq('ip', ip).eq('emp_id', empId.slice(0, 50));
  } catch (e) {
    console.error('[verifyEmployee] clear failures failed:', e);
  }
}

// Returns { status: 'success', empName, department, lastStatus }
// or { status: 'error', message }
export async function verifyEmployee(empId, pin) {
  empId = (empId || '').toString().trim();
  pin = (pin || '').toString().trim();

  const ip = await getClientIp();
  if (await isThrottled(ip, empId)) {
    return { status: 'error', message: LOCK_MESSAGE };
  }

  const { data: emp, error } = await supabaseAdmin
    .from('employees')
    .select('*')
    .eq('emp_id', empId)
    .maybeSingle();

  if (error) {
    return { status: 'error', message: 'ข้อผิดพลาดฐานข้อมูล: ' + error.message };
  }
  if (!emp) {
    await recordFailure(ip, empId);
    return { status: 'error', message: '❌ ไม่พบข้อมูลรหัสพนักงานนี้ในระบบ' };
  }
  if (emp.pin.toString().trim() !== pin) {
    await recordFailure(ip, empId);
    return { status: 'error', message: '❌ รหัส PIN 4 หลักไม่ถูกต้อง โปรดลองอีกครั้ง' };
  }
  if (emp.status !== 'Active') {
    return { status: 'error', message: '❌ รหัสพนักงานนี้ถูกระงับสิทธิ์การใช้งานชั่วคราว' };
  }

  await clearFailures(ip, empId); // ใส่ถูกแล้ว ล้างประวัติที่พิมพ์ผิดก่อนหน้า

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
