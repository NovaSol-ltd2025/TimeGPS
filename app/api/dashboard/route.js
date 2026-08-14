import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { bangkokTodayRangeUtc } from '../../../lib/utils';

// Always run this route dynamically — never statically cache the response,
// since attendance/employee data changes on every request.
export const dynamic = 'force-dynamic';

// Intentionally NOT gated behind isAdminAuthorized: the "แดชบอร์ด" tab is a
// public nav item any employee can open without logging in (same as
// "ลงเวลา"/"ประวัติของฉัน"), e.g. left running on a lobby/kiosk screen. It
// used to require an admin session, so every request from a non-admin
// browser silently got a 401 and the UI (which has no error handling for a
// failed fetch) stayed stuck on its initial zero values forever — looking
// exactly like "data doesn't update in real time" even though the
// auto-refresh polling underneath was firing correctly every 15s.
export async function GET() {
  try {
    const [startIso, endIso] = bangkokTodayRangeUtc();

    const { count: totalEmployees, error: empErr } = await supabaseAdmin
      .from('employees')
      .select('*', { count: 'exact', head: true });

    const { data: logsRaw, error: logErr } = await supabaseAdmin
      .from('attendance')
      .select('*')
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: false });

    if (empErr || logErr) {
      throw new Error((empErr && empErr.message) || (logErr && logErr.message));
    }

    let inCount = 0;
    let outCount = 0;
    const uniqueStaffToday = new Set();

    const logs = (logsRaw || []).map((row) => {
      if (row.type === 'เข้างาน') inCount++;
      if (row.type === 'ออกงาน') outCount++;
      uniqueStaffToday.add(row.emp_id);

      return {
        time: new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Bangkok',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).format(new Date(row.created_at)),
        empId: row.emp_id,
        name: row.name,
        department: row.department,
        type: row.type,
        location: row.loc_name,
        distance: row.distance,
        photo: row.photo_url
      };
    });

    return NextResponse.json({
      status: 'success',
      totalEmployees: totalEmployees || 0,
      todayActiveCount: uniqueStaffToday.size,
      todayIn: inCount,
      todayOut: outCount,
      logs
    });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: 'ข้อผิดพลาดหลังบ้าน: ' + err.message },
      { status: 500 }
    );
  }
}
