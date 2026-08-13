import { NextResponse } from 'next/server';
import { formatBangkokDateTime } from '../../../lib/utils';

// Always run this route dynamically — never statically cache the response,
// since attendance/employee data changes on every request.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'success',
    time: formatBangkokDateTime(),
    // Epoch ms (UTC), used by the frontend to compute a client/server time
    // offset once and keep the on-screen clock ticking locally afterwards,
    // instead of calling this endpoint every second forever.
    nowMs: Date.now()
  });
}
