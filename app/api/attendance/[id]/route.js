import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { isAdminAuthorized } from '../../../../lib/adminSession';

// Always run this route dynamically — never statically cache the response.
export const dynamic = 'force-dynamic';

// Edits an existing attendance record — lets admin correct a mistaken date,
// time, or in/out type (e.g. a record that was logged with the wrong time)
// without having to delete and lose the row entirely.
export async function PUT(request, { params }) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ status: 'error', message: 'ไม่ได้รับอนุญาต' }, { status: 401 });
  }
  try {
    const id = parseInt(params.id, 10);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ status: 'error', message: 'รหัสรายการไม่ถูกต้อง' }, { status: 400 });
    }

    const body = await request.json();
    const dateStr = (body.date || '').trim(); // yyyy-mm-dd
    const timeStr = (body.time || '').trim(); // HH:mm or HH:mm:ss
    const type = (body.type || '').trim();
    const locName = body.locName != null ? body.locName.toString().trim() : undefined;
    const distanceRaw = body.distance;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ status: 'error', message: 'กรุณาระบุวันที่ให้ถูกต้อง' }, { status: 400 });
    }
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(timeStr)) {
      return NextResponse.json({ status: 'error', message: 'กรุณาระบุเวลาให้ถูกต้อง' }, { status: 400 });
    }
    if (type !== 'เข้างาน' && type !== 'ออกงาน') {
      return NextResponse.json({ status: 'error', message: 'ประเภทต้องเป็น เข้างาน หรือ ออกงาน เท่านั้น' }, { status: 400 });
    }

    const normalizedTime = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
    // Interpret the submitted date/time as Bangkok local time.
    const newCreatedAt = new Date(`${dateStr}T${normalizedTime}+07:00`);
    if (Number.isNaN(newCreatedAt.getTime())) {
      return NextResponse.json({ status: 'error', message: 'วันที่หรือเวลาไม่ถูกต้อง' }, { status: 400 });
    }

    const updatePayload = { created_at: newCreatedAt.toISOString(), type };
    if (locName !== undefined) updatePayload.loc_name = locName;
    if (distanceRaw !== undefined && distanceRaw !== null && distanceRaw !== '') {
      const distanceNum = parseInt(distanceRaw, 10);
      if (!Number.isNaN(distanceNum)) updatePayload.distance = distanceNum;
    }

    const { data, error } = await supabaseAdmin
      .from('attendance')
      .update(updatePayload)
      .eq('id', id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json({ status: 'error', message: 'ไม่พบรายการลงเวลาเป้าหมาย' });
    }

    return NextResponse.json({ status: 'success', message: 'แก้ไขรายการลงเวลาเรียบร้อยแล้ว' });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: 'ข้อผิดพลาดหลังบ้าน: ' + err.message },
      { status: 500 }
    );
  }
}

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
