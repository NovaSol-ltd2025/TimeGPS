import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { isAdminAuthorized } from '../../../lib/adminSession';

export async function GET(request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ status: 'error', message: 'ไม่ได้รับอนุญาต' }, { status: 401 });
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('locations')
      .select('*')
      .order('loc_name', { ascending: true });
    if (error) throw error;

    const list = data.map((l) => ({
      locId: l.loc_id,
      locName: l.loc_name,
      lat: l.lat,
      lng: l.lng,
      radius: l.radius
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
    const loc = body.data || {};
    if (!loc.locName || loc.lat === undefined || loc.lng === undefined) {
      return NextResponse.json({ status: 'error', message: 'กรุณากรอกข้อมูลพิกัดให้ครบ' });
    }

    const locId = loc.locId ? loc.locId.toString().trim() : 'LOC' + Date.now();
    const lat = parseFloat(loc.lat);
    const lng = parseFloat(loc.lng);
    const radius = parseInt(loc.radius, 10) || 100;

    const { data: existing } = await supabaseAdmin
      .from('locations')
      .select('loc_id')
      .eq('loc_id', locId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabaseAdmin
        .from('locations')
        .update({ loc_name: loc.locName, lat, lng, radius })
        .eq('loc_id', locId);
      if (error) throw error;
      return NextResponse.json({ status: 'success', message: 'ปรับแก้พิกัดศูนย์กลางจุดทำงานแล้ว' });
    } else {
      const { error } = await supabaseAdmin
        .from('locations')
        .insert({ loc_id: locId, loc_name: loc.locName, lat, lng, radius });
      if (error) throw error;
      return NextResponse.json({ status: 'success', message: 'เพิ่มที่ตั้งจุดพิกัดลงงานสำเร็จ!' });
    }
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: 'ข้อผิดพลาดหลังบ้าน: ' + err.message },
      { status: 500 }
    );
  }
}
