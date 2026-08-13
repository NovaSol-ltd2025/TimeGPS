import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { verifyEmployee } from '../../../lib/employee';
import { distanceMeters, formatBangkokDateTime } from '../../../lib/utils';

// Always run this route dynamically — never statically cache the response,
// since attendance/employee data changes on every request.
export const dynamic = 'force-dynamic';

const SELFIE_BUCKET = 'selfies';

async function uploadSelfie(base64Data, empId) {
  const match = base64Data.match(/^data:(.*);base64,/);
  const contentType = match ? match[1] : 'image/jpeg';
  const pureBase64 = base64Data.replace(/^data:image\/[^;]+;base64,/, '');
  const buffer = Buffer.from(pureBase64, 'base64');
  const fileName = `Selfie_${empId}_${Date.now()}.jpg`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(SELFIE_BUCKET)
    .upload(fileName, buffer, { contentType, upsert: false });

  if (uploadError) {
    throw new Error('ไม่สามารถบันทึกภาพถ่ายลง Supabase Storage: ' + uploadError.message);
  }

  const { data: publicUrlData } = supabaseAdmin.storage.from(SELFIE_BUCKET).getPublicUrl(fileName);
  return publicUrlData.publicUrl;
}

export async function POST(request) {
  try {
    const params = await request.json();
    const empId = (params.empId || '').toString().trim();
    const pin = (params.pin || '').toString().trim();

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
        message:
          'บันทึกไม่สำเร็จ! ระยะพิกัด GPS ห่างเกินกว่าที่ได้รับอนุญาต (' +
          Math.round(dist) +
          ' ม. เกินขีดจำกัด ' +
          radius +
          ' ม.)'
      });
    }

    if (!params.selfieBase64 || !params.selfieBase64.startsWith('data:image')) {
      return NextResponse.json({
        status: 'error',
        message: 'บันทึกไม่สำเร็จ! ระบบต้องการภาพถ่ายเซลฟี่เรียลไทม์เพื่อสแกนยืนยันตัวตน'
      });
    }

    const photoUrl = await uploadSelfie(params.selfieBase64, empId);
    const typeText = params.type === 'IN' ? 'เข้างาน' : 'ออกงาน';

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
      note: 'ตรวจสอบผ่าน (GPS + PIN + สแกนกล้องสด)'
    });

    if (insertError) {
      return NextResponse.json(
        { status: 'error', message: 'บันทึกฐานข้อมูลล้มเหลว: ' + insertError.message },
        { status: 500 }
      );
    }

    const timeStr = formatBangkokDateTime().split(' ')[1];

    return NextResponse.json({
      status: 'success',
      message:
        '✅ บันทึกสำเร็จสิทธิ์สมบูรณ์!\n👤 ' +
        verification.empName +
        '\n🏢 สาขา: ' +
        params.locName +
        '\n⏰ เวลาเซิร์ฟเวอร์: ' +
        timeStr +
        '\n📍 ค่าระยะเบี่ยงเบน: ' +
        Math.round(dist) +
        ' เมตร'
    });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: 'ข้อผิดพลาดหลังบ้าน: ' + err.message },
      { status: 500 }
    );
  }
}
