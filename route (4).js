import { NextResponse } from 'next/server';
import { getAdminSessionFromRequest } from '../../../../lib/adminSession';

// Always run this route dynamically — never statically cache the response,
// since attendance/employee data changes on every request.
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const session = getAdminSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ status: 'error', loggedIn: false });
  }
  return NextResponse.json({ status: 'success', loggedIn: true, email: session.email });
}
