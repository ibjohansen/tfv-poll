import { apiErrorStatus } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { cancelMatrikkelRun, deleteMatrikkelRunLog } from '@/lib/matrikkel-sync';

export const runtime = 'nodejs';

export async function DELETE(request, { params }) {
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ ok: false, message: 'Ugyldig forespørsel.' }, { status: 403 });
  }
  try {
    const action = request.nextUrl.searchParams.get('action');
    const run = action === 'cancel'
      ? await cancelMatrikkelRun((await params).id)
      : await deleteMatrikkelRunLog((await params).id);
    return NextResponse.json({ ok: true, run }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = apiErrorStatus(error, 403);
    console.error('Matrikkel sync cancellation failed', {
      id: (await params).id,
      message: error.message,
      code: error.code || error.cause?.code,
    });
    const message = status === 403 ? 'Du har ikke tilgang til matrikkelsynkronisering.'
      : status === 404 ? 'Kjøringen finnes ikke.'
        : error.message === 'Run still active' ? 'En aktiv kjøring må stoppes før den kan fjernes fra loggen.'
          : status === 409 ? 'Kjøringen er allerede avsluttet.' : 'Kunne ikke endre kjøringen.';
    return NextResponse.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
