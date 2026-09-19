import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { verifyEmployee } from '../../../lib/employee';
import { bangkokTodayRangeUtc } from '../../../lib/utils';

export const dynamic = 'force-dynamic';
const clean = (v) => (v ?? '').toString().trim();

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const empId = clean(searchParams.get('empId')).toUpperCase(); const pin = clean(searchParams.get('pin'));
    if (!empId || !pin) return NextResponse.json({ status: 'error', message: 'กรุณากรอกรหัสพนักงานและ PIN ก่อนดูแดชบอร์ด' }, { status: 401 });
    const verification = await verifyEmployee(empId, pin);
    if (verification.status === 'error') return NextResponse.json(verification, { status: 401 });
    const branch = clean(verification.branch);
    if (!branch) return NextResponse.json({ status: 'error', message: 'พนักงานยังไม่ได้กำหนดสาขา' }, { status: 403 });
    const [startIso, endIso] = bangkokTodayRangeUtc();
    const [{ count: totalEmployees, error: empErr }, { data: logsRaw, error: logErr }] = await Promise.all([
      supabaseAdmin.from('employees').select('emp_id', { count: 'exact', head: true }).eq('branch', branch).eq('status', 'Active'),
      supabaseAdmin.from('attendance').select('created_at,emp_id,name,department,branch,type,loc_name,distance,photo_url,attendance_status').eq('branch', branch).gte('created_at', startIso).lt('created_at', endIso).order('created_at', { ascending: false })
    ]);
    if (empErr || logErr) throw new Error((empErr && empErr.message) || (logErr && logErr.message));
    let todayIn = 0; let todayOut = 0; const unique = new Set();
    const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const logs = (logsRaw || []).map((row) => { if (row.type === 'เข้างาน') todayIn++; if (row.type === 'ออกงาน') todayOut++; unique.add(row.emp_id); return { time: timeFmt.format(new Date(row.created_at)), empId: row.emp_id, name: row.name, department: row.department, type: row.type, location: row.loc_name, distance: row.distance, photo: row.photo_url, attendanceStatus: row.attendance_status || 'ปกติ' }; });
    return NextResponse.json({ status: 'success', employeeName: verification.empName, branch, totalEmployees: totalEmployees || 0, todayActiveCount: unique.size, todayIn, todayOut, logs });
  } catch (err) { return NextResponse.json({ status: 'error', message: 'ข้อผิดพลาดหลังบ้าน: ' + err.message }, { status: 500 }); }
}
