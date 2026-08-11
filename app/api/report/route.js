import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { formatBangkokDateTime } from '../../../lib/utils';
import { isAdminAuthorized } from '../../../lib/adminSession';

const MONTH_NAMES_TH = [
  '',
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม'
];

export async function GET(request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ status: 'error', message: 'ไม่ได้รับอนุญาต' }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const month = parseInt(searchParams.get('month'), 10);
    const year = parseInt(searchParams.get('year'), 10);
    const deptFilter = (searchParams.get('department') || '').trim();

    // Query the whole month in Bangkok local time, expressed as a UTC range.
    const monthStr = month.toString().padStart(2, '0');
    const rangeStart = new Date(`${year}-${monthStr}-01T00:00:00+07:00`);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextMonthYear = month === 12 ? year + 1 : year;
    const nextMonthStr = nextMonth.toString().padStart(2, '0');
    const rangeEnd = new Date(`${nextMonthYear}-${nextMonthStr}-01T00:00:00+07:00`);

    let query = supabaseAdmin
      .from('attendance')
      .select('*')
      .gte('created_at', rangeStart.toISOString())
      .lt('created_at', rangeEnd.toISOString());

    if (deptFilter) {
      query = query.eq('department', deptFilter);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Group by employee -> Bangkok local date -> {inTime, outTime}
    const byEmployee = {};

    for (const row of data) {
      const ts = new Date(row.created_at);
      const dateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(ts); // yyyy-mm-dd

      if (!byEmployee[row.emp_id]) {
        byEmployee[row.emp_id] = {
          empId: row.emp_id,
          name: row.name,
          department: row.department,
          days: {}
        };
      }
      if (!byEmployee[row.emp_id].days[dateStr]) {
        byEmployee[row.emp_id].days[dateStr] = { inTime: null, outTime: null };
      }

      const day = byEmployee[row.emp_id].days[dateStr];
      if (row.type === 'เข้างาน') {
        if (!day.inTime || ts < day.inTime) day.inTime = ts;
      } else if (row.type === 'ออกงาน') {
        if (!day.outTime || ts > day.outTime) day.outTime = ts;
      }
    }

    const report = Object.keys(byEmployee).map((empId) => {
      const emp = byEmployee[empId];
      const dateKeys = Object.keys(emp.days);
      let totalHours = 0;
      let incompleteDays = 0;
      let inCount = 0;
      let outCount = 0;

      dateKeys.forEach((d) => {
        const rec = emp.days[d];
        if (rec.inTime) inCount++;
        if (rec.outTime) outCount++;
        if (rec.inTime && rec.outTime && rec.outTime > rec.inTime) {
          totalHours += (rec.outTime.getTime() - rec.inTime.getTime()) / (1000 * 60 * 60);
        } else {
          incompleteDays++;
        }
      });

      return {
        empId: emp.empId,
        name: emp.name,
        department: emp.department,
        totalDays: dateKeys.length,
        totalHours: Math.round(totalHours * 100) / 100,
        inCount,
        outCount,
        incompleteDays
      };
    });

    report.sort((a, b) => {
      if (a.department !== b.department) return a.department < b.department ? -1 : 1;
      return a.name < b.name ? -1 : 1;
    });

    return NextResponse.json({
      status: 'success',
      month,
      year,
      monthLabel: `${MONTH_NAMES_TH[month]} ${year + 543}`,
      department: deptFilter || 'ทุกสาขา/แผนก',
      generatedAt: formatBangkokDateTime(),
      rows: report
    });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: 'ข้อผิดพลาดหลังบ้าน: ' + err.message },
      { status: 500 }
    );
  }
}
