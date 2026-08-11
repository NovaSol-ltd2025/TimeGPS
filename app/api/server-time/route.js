import { NextResponse } from 'next/server';
import { formatBangkokDateTime } from '../../../lib/utils';

// Always run this route dynamically — never statically cache the response,
// since attendance/employee data changes on every request.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ status: 'success', time: formatBangkokDateTime() });
}
