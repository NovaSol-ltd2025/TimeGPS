import { NextResponse } from 'next/server';
import { clearSessionCookieHeader } from '../../../../lib/adminSession';

// Always run this route dynamically — never statically cache the response,
// since attendance/employee data changes on every request.
export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ status: 'success' });
  response.headers.set('Set-Cookie', clearSessionCookieHeader());
  return response;
}
