import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { createSessionToken, sessionCookieHeader } from '../../../../lib/adminSession';

// Always run this route dynamically — never statically cache the response,
// since attendance/employee data changes on every request.
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const email = (body.email || '').toString().trim().toLowerCase();
    const password = (body.password || '').toString();

    if (!email || !password) {
      return NextResponse.json({ status: 'error', message: 'กรุณากรอกอีเมลและรหัสผ่าน' });
    }

    const { data: admin, error } = await supabaseAdmin
      .from('admin_users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) throw error;

    // Compare against a fixed dummy hash even when the account doesn't
    // exist, so responses take similar time either way (avoids leaking
    // which emails are registered via response timing).
    const hashToCompare = admin ? admin.password_hash : '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5';
    const passwordMatches = await bcrypt.compare(password, hashToCompare);

    if (!admin || !passwordMatches) {
      return NextResponse.json({ status: 'error', message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const token = createSessionToken({ id: admin.id, email: admin.email });
    const response = NextResponse.json({ status: 'success', email: admin.email });
    response.headers.set('Set-Cookie', sessionCookieHeader(token));
    return response;
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: 'ข้อผิดพลาดหลังบ้าน: ' + err.message },
      { status: 500 }
    );
  }
}
