import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { isAdminAuthorized } from '../../../../lib/adminSession';

// Always run this route dynamically — never statically cache the response,
// since attendance/employee data changes on every request.
export const dynamic = 'force-dynamic';

export async function DELETE(request, { params }) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ status: 'error', message: 'ไม่ได้รับอนุญาต' }, { status: 401 });
  }
  try {
    const empId = decodeURIComponent(params.empId).trim();
    const { data, error } = await supabaseAdmin
      .from('employees')
      .delete()
      .eq('emp_id', empId)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json({ status: 'error', message: 'ไม่พบพนักงานเป้าหมาย' });
    }
    return NextResponse.json({ status: 'success', message: 'ลบข้อมูลพนักงานและ PIN เรียบร้อยแล้ว' });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: 'ข้อผิดพลาดหลังบ้าน: ' + err.message },
      { status: 500 }
    );
  }
}
