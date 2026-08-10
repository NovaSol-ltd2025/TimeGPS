import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const password = (body.password || '').toString();

    if (!process.env.ADMIN_PASSWORD) {
      return NextResponse.json({
        status: 'error',
        message: 'ยังไม่ได้ตั้งค่า ADMIN_PASSWORD บนเซิร์ฟเวอร์ (ตัวแปรสภาพแวดล้อมของ Vercel)'
      });
    }

    if (password === process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ status: 'success' });
    }
    return NextResponse.json({
      status: 'error',
      message: 'รหัสผ่านผู้ดูแลระบบไม่ถูกต้อง กรุณาตรวจสอบและลองใหม่อีกครั้ง'
    });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: 'ข้อผิดพลาดหลังบ้าน: ' + err.message },
      { status: 500 }
    );
  }
}
