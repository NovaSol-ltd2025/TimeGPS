import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { isAdminAuthorized } from '../../../lib/adminSession';

export const dynamic = 'force-dynamic';
const clean = (v) => (v ?? '').toString().trim();
const validTime = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

export async function GET(request) {
  if (!isAdminAuthorized(request)) return NextResponse.json({ status: 'error', message: 'ไม่ได้รับอนุญาต' }, { status: 401 });
  try {
    const { data, error } = await supabaseAdmin.from('locations').select('*').order('loc_name', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ status: 'success', data: (data || []).map((l) => ({ locId: l.loc_id, locName: l.loc_name, lat: l.lat, lng: l.lng, radius: l.radius, workStart: l.work_start || '08:30', workEnd: l.work_end || '17:30' })) });
  } catch (err) {
    return NextResponse.json({ status: 'error', message: 'ข้อผิดพลาดหลังบ้าน: ' + err.message }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isAdminAuthorized(request)) return NextResponse.json({ status: 'error', message: 'ไม่ได้รับอนุญาต' }, { status: 401 });
  try {
    const loc = (await request.json()).data || {};
    const locId = clean(loc.locId) || 'LOC' + Date.now();
    const locName = clean(loc.locName);
    const lat = Number(loc.lat); const lng = Number(loc.lng);
    const radius = Number.parseInt(loc.radius, 10) || 100;
    const workStart = clean(loc.workStart) || '08:30'; const workEnd = clean(loc.workEnd) || '17:30';
    if (!locName || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || radius <= 0 || !validTime(workStart) || !validTime(workEnd)) return NextResponse.json({ status: 'error', message: 'ข้อมูลพิกัด รัศมี หรือเวลาไม่ถูกต้อง' }, { status: 400 });
    const { data: existing, error: lookupError } = await supabaseAdmin.from('locations').select('loc_id').eq('loc_id', locId).maybeSingle();
    if (lookupError) throw lookupError;
    const payload = { loc_name: locName, lat, lng, radius, work_start: workStart, work_end: workEnd };
    const result = existing ? await supabaseAdmin.from('locations').update(payload).eq('loc_id', locId) : await supabaseAdmin.from('locations').insert({ loc_id: locId, ...payload });
    if (result.error) throw result.error;
    return NextResponse.json({ status: 'success', message: existing ? 'ปรับแก้ข้อมูลจุดทำงานแล้ว' : 'เพิ่มจุดทำงานสำเร็จ' });
  } catch (err) {
    return NextResponse.json({ status: 'error', message: 'ข้อผิดพลาดหลังบ้าน: ' + err.message }, { status: 500 });
  }
}
