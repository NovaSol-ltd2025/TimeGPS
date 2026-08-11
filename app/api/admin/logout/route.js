import { NextResponse } from 'next/server';
import { clearSessionCookieHeader } from '../../../../lib/adminSession';

export async function POST() {
  const response = NextResponse.json({ status: 'success' });
  response.headers.set('Set-Cookie', clearSessionCookieHeader());
  return response;
}
