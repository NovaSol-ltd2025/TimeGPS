import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { isAdminAuthorized } from '../../../lib/adminSession';

// Always run this route dynamically — never statically cache the response,
// since attendance/employee data changes on every request.
export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ status: 'error', message: 'ไม่ได้รับอนุญาต' }, { status: 401 });
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('employees')
      .select('*')
      .order('emp_id', { ascending: true });
    if (error) throw error;

    const list = data.map((e) => ({
      empId: e.emp_id,
      name: e.name,
      department: e.department,
      branch: e.branch || '',
      pin: e.pin,
      status: e.status
    }));
    return NextResponse.json({ status: 'success', data: list });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: 'ข้อผิดพลาดหลังบ้าน: ' + err.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ status: 'error', message: 'ไม่ได้รับอนุญาต' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const emp = body.data || {};
    const empId = (emp.empId || '').toString().trim();
    if (!empId || !emp.name || !emp.department) {
      return NextResponse.json({ status: 'error', message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    const { data: existing } = await supabaseAdmin
      .from('employees')
      .select('emp_id')
      .eq('emp_id', empId)
      .maybeSingle();

    const pin = emp.pin
      ? emp.pin.toString().trim()
      : Math.floor(1000 + Math.random() * 9000).toString();

    const branch = emp.branch ? emp.branch.toString().trim() : null;

    if (existing) {
      const { error } = await supabaseAdmin
        .from('employees')
        .update({
          name: emp.name,
          department: emp.department,
          branch,
          pin,
          status: emp.status || 'Active'
        })
        .eq('emp_id', empId);
      if (error) throw error;
      return NextResponse.json({
        status: 'success',
        message: 'ปรับปรุงข้อมูลพนักงาน ' + emp.name + ' และรหัสผ่านพิน (' + pin + ') เรียบร้อย!'
      });
    } else {
      const { error } = await supabaseAdmin.from('employees').insert({
        emp_id: empId,
        name: emp.name,
        department: emp.department,
        branch,
        pin,
        status: 'Active'
      });
      if (error) throw error;
      return NextResponse.json({
        status: 'success',
        message: 'เพิ่มพนักงานสำเร็จ! รหัสลงเวลาผ่านเครื่องพินคือ: ' + pin
      });
    }
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: 'ข้อผิดพลาดหลังบ้าน: ' + err.message },
      { status: 500 }
    );
  }
}
