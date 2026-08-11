import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { verifyEmployee } from '../../../lib/employee';

// Always run this route dynamically — never statically cache the response,
// since attendance/employee data changes on every request.
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const empId = (body.empId || '').toString().trim();
    const pin = (body.pin || '').toString().trim();

    // Re-verifies empId + PIN on every call (same as clocking in/out) so
    // this endpoint can only ever return the caller's own records — there
    // is no empId parameter path that bypasses the PIN check.
    const verification = await verifyEmployee(empId, pin);
    if (verification.status === 'error') {
      return NextResponse.json(verification);
    }

    const { data, error } = await supabaseAdmin
      .from('attendance')
      .select('created_at, type, loc_name, distance')
      .eq('emp_id', empId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const records = data.map((row) => {
      const d = new Date(row.created_at);
      return {
        date: new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Bangkok',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }).format(d),
        time: new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Bangkok',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).format(d),
        type: row.type,
        location: row.loc_name,
        distance: row.distance
      };
    });

    return NextResponse.json({
      status: 'success',
      empName: verification.empName,
      department: verification.department,
      records
    });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: 'ข้อผิดพลาดหลังบ้าน: ' + err.message },
      { status: 500 }
    );
  }
}
