import { apiErrorStatus } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { cancelMatrikkelRun, deleteMatrikkelRunLog } from '@/lib/matrikkel-sync';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';

export async function DELETE(request, { params }) {
  const { t } = getRequestI18n(request, 'backend');
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ ok: false, message: t('api.invalidRequest') }, { status: 403 });
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
    const message = t(status === 403 ? 'adminMatrikkel.forbidden'
      : status === 404 ? 'adminMatrikkel.missing'
        : error.message === 'Run still active' ? 'adminMatrikkel.active'
          : status === 409 ? 'adminMatrikkel.finished' : 'adminMatrikkel.change');
    return NextResponse.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
