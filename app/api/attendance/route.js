import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { isAdminAuthorized } from '../../../lib/adminSession';

// Always run this route dynamically — never statically cache the response,
// since attendance data changes on every request.
export const dynamic = 'force-dynamic';

// Lets admin list individual attendance rows (not just the aggregated
// monthly totals from /api/report) so they can spot and remove incorrect
// entries — e.g. a clock-in recorded on a holiday — before payroll runs.
export async function GET(request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ status: 'error', message: 'ไม่ได้รับอนุญาต' }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const month = parseInt(searchParams.get('month'), 10);
    const year = parseInt(searchParams.get('year'), 10);
    const deptFilter = (searchParams.get('department') || '').trim();
    const branchFilter = (searchParams.get('branch') || '').trim();
    const empIdFilter = (searchParams.get('empId') || '').trim();

    if (!month || !year || month < 1 || month > 12) {
      return NextResponse.json({ status: 'error', message: 'กรุณาระบุปีและเดือนให้ถูกต้อง' }, { status: 400 });
    }

    // Query the whole month in Bangkok local time, expressed as a UTC range.
    const monthStr = month.toString().padStart(2, '0');
    const rangeStart = new Date(`${year}-${monthStr}-01T00:00:00+07:00`);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextMonthYear = month === 12 ? year + 1 : year;
    const nextMonthStr = nextMonth.toString().padStart(2, '0');
    const rangeEnd = new Date(`${nextMonthYear}-${nextMonthStr}-01T00:00:00+07:00`);

    let query = supabaseAdmin
      .from('attendance')
      .select('id, created_at, emp_id, name, department, branch, type, loc_name, distance')
      .gte('created_at', rangeStart.toISOString())
      .lt('created_at', rangeEnd.toISOString())
      .order('created_at', { ascending: false });

    if (deptFilter) query = query.eq('department', deptFilter);
    if (branchFilter) query = query.eq('branch', branchFilter);
    if (empIdFilter) query = query.eq('emp_id', empIdFilter);

    const { data, error } = await query;
    if (error) throw error;

    const records = data.map((row) => {
      const d = new Date(row.created_at);
      return {
        id: row.id,
        date: new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Bangkok',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }).format(d),
        dateInput: new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Bangkok',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(d),
        time: new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Bangkok',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).format(d),
        empId: row.emp_id,
        name: row.name,
        department: row.department,
        branch: row.branch || '',
        type: row.type,
        location: row.loc_name,
        distance: row.distance
      };
    });

    return NextResponse.json({ status: 'success', records });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: 'ข้อผิดพลาดหลังบ้าน: ' + err.message },
      { status: 500 }
    );
  }
}
