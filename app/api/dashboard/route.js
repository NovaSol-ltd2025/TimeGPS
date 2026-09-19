import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { verifyEmployee } from '../../../lib/employee';
import { bangkokTodayRangeUtc } from '../../../lib/utils';

export const dynamic = 'force-dynamic';
const clean = (v) => (v ?? '').toString().trim();

async function readCredentials(request) {
  const { searchParams } = new URL(request.url);
  let empId = clean(searchParams.get('empId')).toUpperCase();
  let pin = clean(searchParams.get('pin'));
  if ((!empId || !pin) && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    empId = clean(body.empId).toUpperCase();
    pin = clean(body.pin);
  }
  return { empId, pin };
}

export async function GET(request) {
  return getDashboard(request);
}

export async function POST(request) {
  return getDashboard(request);
}

async function getDashboard(request) {
  try {
    const { empId, pin } = await readCredentials(request);
    if (!empId || !pin) return NextResponse.json({ status: 'error', message: 'กรุณากรอกรหัสพนักงานและ PIN ก่อนดูแดชบอร์ด' }, { status: 401 });

    const verification = await verifyEmployee(empId, pin);
    if (verification.status === 'error') return NextResponse.json(verification, { status: 401 });
    const branch = clean(verification.branch);
    if (!branch) return NextResponse.json({ status: 'error', message: 'ยังไม่ได้กำหนดสาขาให้พนักงาน' }, { status: 403 });

    const [startIso, endIso] = bangkokTodayRangeUtc();
    const [{ count: totalEmployees, error: empErr }, { data: rows, error: logErr }] = await Promise.all([
      supabaseAdmin.from('employees').select('emp_id', { count: 'exact', head: true }).eq('branch', branch).eq('status', 'Active'),
      supabaseAdmin.from('attendance').select('created_at,emp_id,name,department,branch,type,loc_name,distance,photo_url,attendance_status').eq('branch', branch).gte('created_at', startIso).lt('created_at', endIso).order('created_at', { ascending: false })
    ]);
    if (empErr || logErr) throw new Error((empErr && empErr.message) || (logErr && logErr.message));

    let todayIn = 0;
    let todayOut = 0;
    const active = new Set();
    const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const logs = (rows || []).map((row) => {
      if (row.type === 'เข้างาน') todayIn += 1;
      if (row.type === 'ออกงาน') todayOut += 1;
      active.add(row.emp_id);
      return { time: timeFmt.format(new Date(row.created_at)), empId: row.emp_id, name: row.name, department: row.department, type: row.type, location: row.loc_name, distance: row.distance, photo: row.photo_url, attendanceStatus: row.attendance_status || 'ปกติ' };
    });

    return NextResponse.json({ status: 'success', employeeName: verification.empName, branch, totalEmployees: totalEmployees || 0, todayActiveCount: active.size, todayIn, todayOut, logs });
  } catch (err) {
    return NextResponse.json({ status: 'error', message: 'ข้อผิดพลาดหลังบ้าน: ' + err.message }, { status: 500 });
  }
}
