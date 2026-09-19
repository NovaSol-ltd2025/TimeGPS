import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { isAdminAuthorized } from '../../../lib/adminSession';

export const dynamic = 'force-dynamic';
const clean = (v) => (v ?? '').toString().trim();

export async function GET(request) {
  if (!isAdminAuthorized(request)) return NextResponse.json({ status: 'error', message: 'ไม่ได้รับอนุญาต' }, { status: 401 });
  try {
    const { data, error } = await supabaseAdmin.from('employees').select('emp_id,name,department,branch,status').order('emp_id', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ status: 'success', data: (data || []).map((e) => ({ empId: e.emp_id, name: e.name, department: e.department, branch: e.branch || '', status: e.status })) });
  } catch (err) {
    return NextResponse.json({ status: 'error', message: 'ข้อผิดพลาดหลังบ้าน: ' + err.message }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isAdminAuthorized(request)) return NextResponse.json({ status: 'error', message: 'ไม่ได้รับอนุญาต' }, { status: 401 });
  try {
    const emp = (await request.json()).data || {};
    const empId = clean(emp.empId).toUpperCase();
    const name = clean(emp.name);
    const department = clean(emp.department);
    const branch = clean(emp.branch) || null;
    const pin = clean(emp.pin) || Math.floor(1000 + Math.random() * 9000).toString();
    if (!empId || !name || !department || !/^\d{4}$/.test(pin)) return NextResponse.json({ status: 'error', message: 'กรุณากรอกข้อมูลให้ครบ และ PIN ต้องเป็นตัวเลข 4 หลัก' }, { status: 400 });
    const { data: existing, error: lookupError } = await supabaseAdmin.from('employees').select('emp_id').eq('emp_id', empId).maybeSingle();
    if (lookupError) throw lookupError;
    const payload = { name, department, branch, pin: await bcrypt.hash(pin, 12), status: clean(emp.status) || 'Active' };
    if (existing) {
      const { error } = await supabaseAdmin.from('employees').update(payload).eq('emp_id', empId);
      if (error) throw error;
      return NextResponse.json({ status: 'success', message: 'ปรับปรุงข้อมูลแล้ว PIN ใหม่คือ: ' + pin });
    }
    const { error } = await supabaseAdmin.from('employees').insert({ emp_id: empId, ...payload });
    if (error) throw error;
    return NextResponse.json({ status: 'success', message: 'เพิ่มพนักงานสำเร็จ PIN คือ: ' + pin });
  } catch (err) {
    return NextResponse.json({ status: 'error', message: 'ข้อผิดพลาดหลังบ้าน: ' + err.message }, { status: 500 });
  }
}
