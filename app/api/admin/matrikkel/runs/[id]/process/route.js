import { NextResponse } from 'next/server';
import { requireMatrikkelSync } from '@/lib/admin-access';
import { processMatrikkelRun } from '@/lib/matrikkel-sync';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ ok: false, message: 'Ugyldig forespørsel.' }, { status: 403 });
  }
  try {
    await requireMatrikkelSync();
    const run = await processMatrikkelRun((await params).id, { batchSize: 2 });
    return NextResponse.json({ ok: true, run }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error.message === 'Unauthorized' ? 403 : error.message === 'Run not found' ? 404 : 500;
    console.error('Matrikkel sync processing failed', { id: (await params).id, message: error.message, code: error.code || error.cause?.code });
    return NextResponse.json({ ok: false, message: status === 403 ? 'Du har ikke tilgang til matrikkelsynkronisering.' : 'Synkroniseringen stoppet på grunn av en teknisk feil.' }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
