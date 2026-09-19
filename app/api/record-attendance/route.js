import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { verifyEmployee } from '../../../lib/employee';
import { distanceMeters, formatBangkokDateTime, bangkokNowParts, bangkokTodayRangeUtc } from '../../../lib/utils';

export const dynamic = 'force-dynamic';
const SELFIE_BUCKET = 'selfies';
const clean = (v) => (v ?? '').toString().trim();

function parseTimeToMinutes(value, fallback) {
  const text = clean(value) || fallback;
  const match = text.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : parseTimeToMinutes(fallback, fallback);
}

function determineStatus(type, workStart, workEnd) {
  const now = bangkokNowParts();
  const nowMinutes = Number(now.hour) * 60 + Number(now.minute);
  if (type === 'IN') return nowMinutes > parseTimeToMinutes(workStart, '08:30') + 15 ? 'สาย' : 'ปกติ';
  return nowMinutes < parseTimeToMinutes(workEnd, '17:30') - 15 ? 'ออกก่อนเวลา' : 'ปกติ';
}

async function uploadSelfie(base64Data, empId) {
  const match = base64Data.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,/i);
  if (!match) throw new Error('รูปภาพไม่อยู่ในรูปแบบที่รองรับ');
  const buffer = Buffer.from(base64Data.slice(match[0].length), 'base64');
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new Error('ขนาดรูปภาพไม่ถูกต้องหรือเกิน 5 MB');
  const fileName = `Selfie_${empId}_${Date.now()}.jpg`;
  const { error } = await supabaseAdmin.storage.from(SELFIE_BUCKET).upload(fileName, buffer, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error('ไม่สามารถบันทึกภาพถ่ายลง Supabase Storage: ' + error.message);
  return supabaseAdmin.storage.from(SELFIE_BUCKET).getPublicUrl(fileName).data.publicUrl;
}

export async function POST(request) {
  try {
    const params = await request.json();
    const empId = clean(params.empId).toUpperCase();
    const pin = clean(params.pin);
    const type = params.type === 'IN' || params.type === 'OUT' ? params.type : null;
    if (!empId || !pin || !type) return NextResponse.json({ status: 'error', message: 'ข้อมูลการลงเวลาไม่ครบถ้วน' }, { status: 400 });

    const verification = await verifyEmployee(empId, pin);
    if (verification.status === 'error') return NextResponse.json(verification, { status: 401 });

    const { data: employee, error: employeeError } = await supabaseAdmin.from('employees').select('emp_id,name,department,branch,status').eq('emp_id', empId).maybeSingle();
    if (employeeError || !employee) throw employeeError || new Error('ไม่พบพนักงาน');
    if (!employee.branch) return NextResponse.json({ status: 'error', message: 'ยังไม่ได้กำหนดสาขาให้พนักงาน' }, { status: 400 });

    const locName = clean(params.locName);
    const { data: location, error: locationError } = await supabaseAdmin.from('locations').select('loc_id,loc_name,lat,lng,radius,work_start,work_end').eq('loc_name', locName).maybeSingle();
    if (locationError || !location) return NextResponse.json({ status: 'error', message: 'ไม่พบจุดลงเวลานี้ในระบบ' }, { status: 400 });

    const userLat = Number(params.userLat); const userLng = Number(params.userLng);
    if (!Number.isFinite(userLat) || !Number.isFinite(userLng) || userLat < -90 || userLat > 90 || userLng < -180 || userLng > 180) return NextResponse.json({ status: 'error', message: 'พิกัด GPS ไม่ถูกต้อง' }, { status: 400 });
    const dist = distanceMeters(location.lat, location.lng, userLat, userLng);
    if (dist > location.radius) return NextResponse.json({ status: 'error', message: `บันทึกไม่สำเร็จ! อยู่ห่างจากจุดลงเวลา ${Math.round(dist)} ม. เกินขีดจำกัด ${location.radius} ม.` });

    const [startIso, endIso] = bangkokTodayRangeUtc();
    const { data: lastRows, error: lastError } = await supabaseAdmin.from('attendance').select('type').eq('emp_id', empId).gte('created_at', startIso).lt('created_at', endIso).order('created_at', { ascending: false }).limit(1);
    if (lastError) throw lastError;
    const lastType = lastRows?.[0]?.type;
    if ((type === 'IN' && lastType === 'เข้างาน') || (type === 'OUT' && lastType !== 'เข้างาน')) return NextResponse.json({ status: 'error', message: type === 'IN' ? 'วันนี้ลงเวลาเข้างานไปแล้ว' : 'ต้องลงเวลาเข้างานก่อนลงเวลาออก' }, { status: 409 });

    const selfie = clean(params.selfieBase64);
    if (!selfie) return NextResponse.json({ status: 'error', message: 'กรุณาถ่ายภาพเซลฟี่ก่อนลงเวลา' }, { status: 400 });
    const photoUrl = await uploadSelfie(selfie, empId);
    const typeText = type === 'IN' ? 'เข้างาน' : 'ออกงาน';
    const attendanceStatus = determineStatus(type, location.work_start, location.work_end);
    const { error: insertError } = await supabaseAdmin.from('attendance').insert({ emp_id: empId, name: employee.name, department: employee.department, branch: employee.branch, location_id: location.loc_id, type: typeText, loc_name: location.loc_name, distance: Math.round(dist), lat: userLat, lng: userLng, photo_url: photoUrl, attendance_status: attendanceStatus, note: 'ตรวจสอบผ่าน (GPS + PIN + สแกนกล้องสด) | ' + attendanceStatus });
    if (insertError) throw insertError;

    return NextResponse.json({ status: 'success', message: `✅ บันทึกสำเร็จ\n👤 ${employee.name}\n🏢 สาขา: ${employee.branch}\n⏰ เวลาเซิร์ฟเวอร์: ${formatBangkokDateTime().split(' ')[1]}\n📌 สถานะ: ${attendanceStatus}` });
  } catch (err) {
    return NextResponse.json({ status: 'error', message: 'ข้อผิดพลาดหลังบ้าน: ' + err.message }, { status: 500 });
  }
}
