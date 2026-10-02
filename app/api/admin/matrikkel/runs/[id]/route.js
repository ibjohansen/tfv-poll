import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { cancelMatrikkelRun, completeMatrikkelFollowup, deleteMatrikkelRunLog } from '@/lib/matrikkel-sync';
import { getRequestI18n } from '@/lib/i18n/request';
import { isSameOriginRequest } from '@/lib/request-origin';

export const runtime = 'nodejs';

function requestError(request, error, id, t) {
  const status = error.message === 'Unauthorized' ? 403 : apiErrorStatus(error);
  console.error('Matrikkel run change failed', {
    id,
    method: request.method,
    message: error.message,
    code: error.code || error.cause?.code,
  });
  const message = t(status === 403 ? 'adminMatrikkel.forbidden'
    : status === 404 ? 'adminMatrikkel.missing'
      : error.message === 'Run still active' ? 'adminMatrikkel.active'
        : status === 409 ? 'adminMatrikkel.finished' : 'adminMatrikkel.change');
  return NextResponse.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request, { params }) {
  const { t } = getRequestI18n(request, 'backend');
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, message: t('api.invalidRequest') }, { status: 403 });
  }
  const id = (await params).id;
  try {
    const input = await readJsonObject(request);
    if (input.action !== 'complete_followup') throw new SyntaxError('Invalid follow-up action');
    const run = await completeMatrikkelFollowup(id);
    return NextResponse.json({ ok: true, run }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return requestError(request, error, id, t);
  }
}

export async function DELETE(request, { params }) {
  const { t } = getRequestI18n(request, 'backend');
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, message: t('api.invalidRequest') }, { status: 403 });
  }
  try {
    const action = request.nextUrl.searchParams.get('action');
    const run = action === 'cancel'
      ? await cancelMatrikkelRun((await params).id)
      : await deleteMatrikkelRunLog((await params).id);
    return NextResponse.json({ ok: true, run }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return requestError(request, error, (await params).id, t);
  }
}
