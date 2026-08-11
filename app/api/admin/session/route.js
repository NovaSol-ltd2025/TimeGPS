import { NextResponse } from 'next/server';
import { getAdminSessionFromRequest } from '../../../../lib/adminSession';

export async function GET(request) {
  const session = getAdminSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ status: 'error', loggedIn: false });
  }
  return NextResponse.json({ status: 'success', loggedIn: true, email: session.email });
}
