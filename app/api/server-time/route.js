export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { formatBangkokDateTime } from '../../../lib/utils';

export async function GET() {
  return NextResponse.json({ status: 'success', time: formatBangkokDateTime() });
}
