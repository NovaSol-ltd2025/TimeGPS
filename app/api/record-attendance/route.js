import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { verifyEmployee } from '../../../lib/employee';
import { distanceMeters, formatBangkokDateTime, bangkokTodayRangeUtc } from '../../../lib/utils';

// Always run this route dynamically — never statically cache the response,
// since attendance/employee data changes on every request.
export const dynamic = 'force-dynamic';

const SELFIE_BUCKET = 'selfies';
const MAX_SELFIE_BYTES = 1.5 * 1024 * 1024; // หน้าเว็บส่ง JPEG 640x480 ปกติไม่เกิน ~100 KB
const JPEG_PREFIX = 'data:image/jpeg;base64,';

// ความคลาดเคลื่อนที่ยอมรับเมื่อเทียบพิกัดใน QR Code กับพิกัดที่ลงทะเบียนไว้
// 0.00001 องศา ≈ 1.1 เมตร (QR ที่พิมพ์ไว้แล้วยังใช้ได้ตามเดิม)
const LOCATION_MATCH_TOLERANCE_DEG = 0.00001;

function fail(message, status) {
  return NextResponse.json({ status: 'error', message }, status ? { status } : undefined);
}

// ── ไม่เชื่อค่า officeLat / officeLng / radius / locName จากเบราว์เซอร์ ──
// พิกัดใน QR Code ใช้ "ระบุว่าเป็นจุดไหน" เท่านั้น แล้วไปเอาพิกัด รัศมี และชื่อ
// ที่แท้จริงจากตาราง locations ในฐานข้อมูล ถ้าไม่ตรงกับจุดที่ลงทะเบียน = ปฏิเสธ
async function findRegisteredLocation(officeLat, officeLng) {
  const { data, error } = await supabaseAdmin
    .from('locations')
    .select('loc_id, loc_name, lat, lng, radius');
  if (error) throw error;

  return (
    (data || []).find(
      (loc) =>
        Math.abs(Number(loc.lat) - officeLat) <= LOCATION_MATCH_TOLERANCE_DEG &&
        Math.abs(Number(loc.lng) - officeLng) <= LOCATION_MATCH_TOLERANCE_DEG
    ) || null
  );
}

// รับเฉพาะ JPEG จริง ขนาดไม่เกินกำหนด (ตรวจ magic bytes FF D8 FF)
function decodeSelfie(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(JPEG_PREFIX)) return null;
  if (dataUrl.length > Math.ceil((MAX_SELFIE_BYTES * 4) / 3) + 100) return null;

  const buffer = Buffer.from(dataUrl.slice(JPEG_PREFIX.length), 'base64');
  if (buffer.length < 1000 || buffer.length > MAX_SELFIE_BYTES) return null;
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) return null;
  return buffer;
}

async function uploadSelfie(buffer, empId) {
  const fileName = `Selfie_${empId}_${Date.now()}.jpg`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(SELFIE_BUCKET)
    .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: false });

  if (uploadError) {
    throw new Error('ไม่สามารถบันทึกภาพถ่ายลง Supabase Storage: ' + uploadError.message);
  }

  const { data: publicUrlData } = supabaseAdmin.storage.from(SELFIE_BUCKET).getPublicUrl(fileName);
  return { fileName, url: publicUrlData.publicUrl };
}

async function removeSelfie(fileName) {
  try {
    await supabaseAdmin.storage.from(SELFIE_BUCKET).remove([fileName]);
  } catch (e) {
    console.error('[record-attendance] cleanup selfie failed:', e);
  }
}

export async function POST(request) {
  let uploadedFileName = null;

  try {
    const params = await request.json();
    const empId = (params.empId || '').toString().trim();
    const pin = (params.pin || '').toString().trim();

    const verification = await verifyEmployee(empId, pin);
    if (verification.status === 'error') {
      return fail(verification.message);
    }

    const userLat = parseFloat(params.userLat);
    const userLng = parseFloat(params.userLng);
    const officeLat = parseFloat(params.officeLat);
    const officeLng = parseFloat(params.officeLng);

    if ([userLat, userLng, officeLat, officeLng].some((n) => Number.isNaN(n))) {
      return fail('พิกัด GPS ไม่ถูกต้อง');
    }
    if (Math.abs(userLat) > 90 || Math.abs(userLng) > 180) {
      return fail('พิกัด GPS ไม่ถูกต้อง');
    }

    // 1) หาจุดลงเวลาจริงจากฐานข้อมูล (ไม่ใช้ radius / locName ที่ส่งมา)
    const location = await findRegisteredLocation(officeLat, officeLng);
    if (!location) {
      return fail(
        'QR Code นี้ไม่ตรงกับจุดลงเวลาที่ลงทะเบียนไว้ในระบบ กรุณาแจ้งฝ่ายบุคคลเพื่อพิมพ์ QR Code ใหม่'
      );
    }

    const radius = Number(location.radius) > 0 ? Number(location.radius) : 100;
    const dist = distanceMeters(Number(location.lat), Number(location.lng), userLat, userLng);
    if (dist > radius) {
      return fail(
        'บันทึกไม่สำเร็จ! ระยะพิกัด GPS ห่างเกินกว่าที่ได้รับอนุญาต (' +
          Math.round(dist) +
          ' ม. เกินขีดจำกัด ' +
          radius +
          ' ม.)'
      );
    }

    const typeText = params.type === 'IN' ? 'เข้างาน' : 'ออกงาน';

    // 2) กันบันทึกซ้ำฝั่งเซิร์ฟเวอร์ — กติกาเดียวกับที่หน้าเว็บบล็อกอยู่แล้ว
    //    (รายการล่าสุดของวันนี้เป็น "เข้างาน" → เข้าซ้ำไม่ได้, เป็น "ออกงาน" → ออกซ้ำไม่ได้)
    const [startIso, endIso] = bangkokTodayRangeUtc();
    const { data: lastToday, error: lastErr } = await supabaseAdmin
      .from('attendance')
      .select('type')
      .eq('emp_id', empId)
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastErr) throw lastErr;

    if (lastToday && lastToday.type === typeText) {
      return fail(
        `วันนี้คุณบันทึก "${typeText}" ไปแล้ว ไม่สามารถบันทึกซ้ำได้ หากข้อมูลผิดพลาดกรุณาแจ้งฝ่ายบุคคล`
      );
    }

    // 3) ตรวจรูปเซลฟี่
    if (!params.selfieBase64 || !String(params.selfieBase64).startsWith('data:image')) {
      return fail('บันทึกไม่สำเร็จ! ระบบต้องการภาพถ่ายเซลฟี่เรียลไทม์เพื่อสแกนยืนยันตัวตน');
    }
    const selfieBuffer = decodeSelfie(params.selfieBase64);
    if (!selfieBuffer) {
      return fail('บันทึกไม่สำเร็จ! ไฟล์ภาพเซลฟี่ไม่ถูกต้องหรือมีขนาดใหญ่เกินกำหนด กรุณาถ่ายใหม่');
    }

    const photo = await uploadSelfie(selfieBuffer, empId);
    uploadedFileName = photo.fileName;

    const { error: insertError } = await supabaseAdmin.from('attendance').insert({
      emp_id: empId,
      name: verification.empName,
      department: verification.department,
      branch: verification.branch || null,
      type: typeText,
      loc_name: location.loc_name, // จากฐานข้อมูล ไม่ใช่ค่าที่เบราว์เซอร์ส่งมา
      distance: Math.round(dist),
      lat: userLat,
      lng: userLng,
      photo_url: photo.url,
      note: 'ตรวจสอบผ่าน (GPS + PIN + สแกนกล้องสด)'
    });

    if (insertError) {
      console.error('[record-attendance] insert failed:', insertError);
      await removeSelfie(uploadedFileName); // ไม่ทิ้งรูปค้างในที่เก็บ
      uploadedFileName = null;
      return fail('บันทึกฐานข้อมูลล้มเหลว กรุณาลองใหม่อีกครั้ง', 500);
    }

    const timeStr = formatBangkokDateTime().split(' ')[1];

    return NextResponse.json({
      status: 'success',
      message:
        '✅ บันทึกสำเร็จสิทธิ์สมบูรณ์!\n👤 ' +
        verification.empName +
        '\n🏢 สาขา: ' +
        location.loc_name +
        '\n⏰ เวลาเซิร์ฟเวอร์: ' +
        timeStr +
        '\n📍 ค่าระยะเบี่ยงเบน: ' +
        Math.round(dist) +
        ' เมตร'
    });
  } catch (err) {
    console.error('[record-attendance] error:', err);
    if (uploadedFileName) await removeSelfie(uploadedFileName);
    return fail('ข้อผิดพลาดหลังบ้าน กรุณาลองใหม่อีกครั้ง', 500);
  }
}
