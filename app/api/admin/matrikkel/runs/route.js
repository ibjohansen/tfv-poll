import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { createMatrikkelRun, failPendingMatrikkelRun, getMatrikkelRun, getMatrikkelRuns } from '@/lib/matrikkel-sync';
import { dispatchMatrikkelRun } from '@/lib/matrikkel-background';
import { getRequestI18n } from '@/lib/i18n/request';
import { getApplicationOrigin, isSameOriginRequest } from '@/lib/request-origin';

export const runtime = 'nodejs';

export async function GET(request) {
  const { t } = getRequestI18n(request, 'backend.adminMatrikkel');
  try {
    const id = request.nextUrl.searchParams.get('id');
    const data = id ? await getMatrikkelRun(id) : await getMatrikkelRuns();
    return NextResponse.json({ ok: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = apiErrorStatus(error, 403);
    console.error('Matrikkel sync read failed', { message: error.message, code: error.code || error.cause?.code });
    return NextResponse.json({ ok: false, message: t(status === 403 ? 'forbidden' : 'status') }, { status });
  }
}

export async function POST(request) {
  const { t } = getRequestI18n(request, 'backend');
  if (!isSameOriginRequest(request)) return NextResponse.json({ ok: false, message: t('api.invalidRequest') }, { status: 403 });
  try {
    const input = await readJsonObject(request);
    let run = await createMatrikkelRun({ hNumber: input.hNumber, memberId: input.memberId, memberIds: input.memberIds });
    let backgroundStarted = false;
    if (process.env.NODE_ENV === 'production' && run.status === 'pending') {
      try {
        await dispatchMatrikkelRun(run.id, getApplicationOrigin(request));
        backgroundStarted = true;
      } catch (error) {
        console.error('Matrikkel background dispatch failed', { runId: run.id, code: error.code, status: error.status, occurredAt: new Date().toISOString() });
        run = { ...run, ...await failPendingMatrikkelRun(run.id) };
        if (run.status === 'failed' || run.status === 'pending') {
          return NextResponse.json({ ok: false, run, backgroundStarted: false,
            message: run.error_message || t('adminMatrikkel.startUnconfirmed'),
          }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
        }
        // Worker kan ha startet selv om kvitteringen gikk tapt. Ikke start
        // en ekstra behandling fra nettleseren eller overskriv kjørestatus.
        backgroundStarted = run.status === 'running';
      }
    }
    return NextResponse.json({ ok: true, run, backgroundStarted }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = apiErrorStatus(error, 403);
    const knownMessages = {
      'Matrikkel API not configured': t('adminMatrikkel.apiMissing'),
      'Sync already running': t('adminMatrikkel.alreadyRunning'),
      'Invalid H-number': t('adminMatrikkel.invalidHNumber'),
      'Invalid member selection': t('adminMatrikkel.invalidSelection'),
      'Member not found': t('adminMatrikkel.memberMissing'),
    };
    const message = knownMessages[error.message]
      || (status === 403 ? t('adminMatrikkel.forbidden') : t('adminMatrikkel.start'));
    console.error('Matrikkel sync start failed', { message: error.message, code: error.code || error.cause?.code });
    return NextResponse.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
