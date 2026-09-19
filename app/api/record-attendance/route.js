import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { verifyEmployee } from '../../../lib/employee';
import { distanceMeters, formatBangkokDateTime } from '../../../lib/utils';

export const dynamic = 'force-dynamic';
const SELFIE_BUCKET = 'selfies';

function normalize(value) {
  return (value ?? '').toString().trim();
}

function parseTimeToMinutes(value, fallback = '08:30') {
  const text = normalize(value) || fallback;
  const match = text.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return parseTimeToMinutes(fallback, fallback);
  return Number(match[1]) * 60 + Number(match[2]);
}

function determineStatus(type, now, workStart, workEnd) {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseTimeToMinutes(workStart, '08:30');
  const endMinutes = parseTimeToMinutes(workEnd, '17:30');

  if (type === 'IN') {
    return nowMinutes > startMinutes + 15 ? 'สาย' : 'ปกติ';
  }
  return nowMinutes < endMinutes - 15 ? 'ออกก่อนเวลา' : 'ปกติ';
}

async function uploadSelfie(base64Data, empId) {
  const match = base64Data.match(/^data:(.*);base64,/);
  const contentType = match ? match[1] : 'image/jpeg';
  const pureBase64 = base64Data.replace(/^data:image\/[^;]+;base64,/, '');
  const buffer = Buffer.from(pureBase64, 'base64');
  const fileName = `Selfie_${empId}_${Date.now()}.jpg`;

  const { error: uploadError } = await supabaseAdmin.storage.from(SELFIE_BUCKET).upload(fileName, buffer, {
    contentType,
    upsert: false
  });

  if (uploadError) {
    throw new Error('ไม่สามารถบันทึกภาพถ่ายลง Supabase Storage: ' + uploadError.message);
  }

  const { data: publicUrlData } = supabaseAdmin.storage.from(SELFIE_BUCKET).getPublicUrl(fileName);
  return publicUrlData.publicUrl;
}

export async function POST(request) {
  try {
    const params = await request.json();
    const empId = normalize(params.empId).toUpperCase();
    const pin = normalize(params.pin);
    const verification = await verifyEmployee(empId, pin);

    if (verification.status === 'error') {
      return NextResponse.json({ status: 'error', message: verification.message });
    }

    const userLat = parseFloat(params.userLat);
    const userLng = parseFloat(params.userLng);
    const officeLat = parseFloat(params.officeLat);
    const officeLng = parseFloat(params.officeLng);
    const radius = parseFloat(params.radius) || 100;

    if ([userLat, userLng, officeLat, officeLng].some((n) => Number.isNaN(n))) {
      return NextResponse.json({ status: 'error', message: 'พิกัด GPS ไม่ถูกต้อง' });
    }

    const dist = distanceMeters(officeLat, officeLng, userLat, userLng);
    if (dist > radius) {
      return NextResponse.json({
        status: 'error',
        message: 'บันทึกไม่สำเร็จ! ระยะพิกัด GPS ห่างเกินกว่าที่ได้รับอนุญาต (' + Math.round(dist) + ' ม. เกินขีดจำกัด ' + radius + ' ม.)'
      });
    }

    if (!params.selfieBase64 || !params.selfieBase64.startsWith('data:image')) {
      return NextResponse.json({
        status: 'error',
        message: 'บันทึกไม่สำเร็จ! ระบบต้องการภาพถ่ายเซลฟี่เรียลไทม์เพื่อยืนยันตัวตน' 
      });
    }

    const photoUrl = await uploadSelfie(params.selfieBase64, empId);
    const typeText = params.type === 'IN' ? 'เข้างาน' : 'ออกงาน';
    const workStart = normalize(params.workStart) || '08:30';
    const workEnd = normalize(params.workEnd) || '17:30';
    const attendanceStatus = determineStatus(typeText === 'เข้างาน' ? 'IN' : 'OUT', new Date(), workStart, workEnd);

    const { error: insertError } = await supabaseAdmin.from('attendance').insert({
      emp_id: empId,
      name: verification.empName,
      department: verification.department,
      branch: verification.branch || null,
      type: typeText,
      loc_name: params.locName,
      distance: Math.round(dist),
      lat: userLat,
      lng: userLng,
      photo_url: photoUrl,
      attendance_status: attendanceStatus,
      note: 'ตรวจสอบผ่าน (GPS + PIN + สแกนกล้องสด) | ' + attendanceStatus
    });

    if (insertError) {
      return NextResponse.json({
        status: 'error',
        message: 'บันทึกฐานข้อมูลล้มเหลว: ' + insertError.message
      }, { status: 500 });
    }

    const timeStr = formatBangkokDateTime().split(' ')[1];

    return NextResponse.json({
      status: 'success',
      message: '✅ บันทึกสำเร็จสิทธิ์สมบูรณ์!\n👤 ' + verification.empName + '\n🏢 สาขา: ' + params.locName + '\n⏰ เวลาเซิร์ฟเวอร์: ' + timeStr + '\n📍 ค่าระยะเบี่ยงเบน: ' + Math.round(dist) + ' เมตร\n📌 สถานะ: ' + attendanceStatus
    });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: 'ข้อผิดพลาดหลังบ้าน: ' + err.message },
      { status: 500 }
    );
  }
}
