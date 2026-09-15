import { apiErrorStatus } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { approveMatrikkelItem } from '@/lib/matrikkel-sync';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ ok: false, message: 'Ugyldig forespørsel.' }, { status: 403 });
  }
  try {
    const values = await params;
    const run = await approveMatrikkelItem(values.id, values.memberId);
    return NextResponse.json({ ok: true, run }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = apiErrorStatus(error, 403);
    console.error('Matrikkel review approval failed', { message: error.message, code: error.code || error.cause?.code });
    return NextResponse.json({ ok: false, message: status === 403 ? 'Du har ikke tilgang.' : 'Kunne ikke godkjenne oppslaget.' }, { status });
  }
}
