import { apiErrorStatus } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { requireMatrikkelSync } from '@/lib/admin-access';
import { processMatrikkelRun } from '@/lib/matrikkel-sync';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  const { t } = getRequestI18n(request, 'backend');
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ ok: false, message: t('api.invalidRequest') }, { status: 403 });
  }
  try {
    await requireMatrikkelSync();
    const run = await processMatrikkelRun((await params).id, { batchSize: 2 });
    return NextResponse.json({ ok: true, run }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = apiErrorStatus(error, 403);
    console.error('Matrikkel sync processing failed', { id: (await params).id, message: error.message, code: error.code || error.cause?.code });
    return NextResponse.json({ ok: false, message: t(status === 403 ? 'adminMatrikkel.forbidden' : 'adminMatrikkel.processFailed') }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
