import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { isAdminAuthorized } from '../../../../lib/adminSession';

// Always run this route dynamically — never statically cache the response.
export const dynamic = 'force-dynamic';

// Deletes a single incorrect attendance record (e.g. a clock-in mistakenly
// recorded on a holiday) so it is excluded from payroll calculations.
export async function DELETE(request, { params }) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ status: 'error', message: 'ไม่ได้รับอนุญาต' }, { status: 401 });
  }
  try {
    const id = parseInt(params.id, 10);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ status: 'error', message: 'รหัสรายการไม่ถูกต้อง' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('attendance')
      .delete()
      .eq('id', id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json({ status: 'error', message: 'ไม่พบรายการลงเวลาเป้าหมาย (อาจถูกลบไปแล้ว)' });
    }

    return NextResponse.json({ status: 'success', message: 'ลบรายการลงเวลาเรียบร้อยแล้ว' });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: 'ข้อผิดพลาดหลังบ้าน: ' + err.message },
      { status: 500 }
    );
  }
}
