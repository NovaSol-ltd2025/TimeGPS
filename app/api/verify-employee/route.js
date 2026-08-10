export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { verifyEmployee } from '../../../lib/employee';

export async function POST(request) {
  try {
    const body = await request.json();
    const result = await verifyEmployee(body.empId, body.pin);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: 'ข้อผิดพลาดหลังบ้าน: ' + err.message },
      { status: 500 }
    );
  }
}
