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
    const locId = decodeURIComponent(params.locId).trim();
    const { data, error } = await supabaseAdmin
      .from('locations')
      .delete()
      .eq('loc_id', locId)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json({ status: 'error', message: 'ไม่พบพิกัดจุดลงงาน' });
    }
    return NextResponse.json({ status: 'success', message: 'ลบจุดพิกัดออกจากตารางสำเร็จ' });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: 'ข้อผิดพลาดหลังบ้าน: ' + err.message },
      { status: 500 }
    );
  }
}
