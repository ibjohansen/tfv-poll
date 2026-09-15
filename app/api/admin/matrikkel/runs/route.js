import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { createMatrikkelRun, failPendingMatrikkelRun, getMatrikkelRun, getMatrikkelRuns } from '@/lib/matrikkel-sync';
import { dispatchMatrikkelRun } from '@/lib/matrikkel-background';

export const runtime = 'nodejs';

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === request.nextUrl.origin;
}

export async function GET(request) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    const data = id ? await getMatrikkelRun(id) : await getMatrikkelRuns();
    return NextResponse.json({ ok: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = apiErrorStatus(error, 403);
    console.error('Matrikkel sync read failed', { message: error.message, code: error.code || error.cause?.code });
    return NextResponse.json({ ok: false, message: status === 403 ? 'Du har ikke tilgang til matrikkelsynkronisering.' : 'Kunne ikke hente synkroniseringsstatus.' }, { status });
  }
}

export async function POST(request) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, message: 'Ugyldig forespørsel.' }, { status: 403 });
  try {
    const input = await readJsonObject(request);
    let run = await createMatrikkelRun({ hNumber: input.hNumber });
    let backgroundStarted = false;
    if (process.env.NODE_ENV === 'production' && run.status === 'pending') {
      try {
        await dispatchMatrikkelRun(run.id, request.nextUrl.origin);
        backgroundStarted = true;
      } catch (error) {
        console.error('Matrikkel background dispatch failed', { runId: run.id, code: error.code, status: error.status, occurredAt: new Date().toISOString() });
        run = { ...run, ...await failPendingMatrikkelRun(run.id) };
        if (run.status === 'failed' || run.status === 'pending') {
          return NextResponse.json({ ok: false, run, backgroundStarted: false,
            message: run.error_message || 'Kunne ikke bekrefte oppstart. Kontroller kjørestatus før du prøver igjen.',
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
    const message = error.message === 'Matrikkel API not configured' ? 'Matrikkel-API er ikke konfigurert.'
      : error.message === 'Sync already running' ? 'En synkronisering pågår allerede.'
        : error.message === 'Invalid H-number' ? 'H-nummeret har ugyldig format.'
        : status === 403 ? 'Du har ikke tilgang til matrikkelsynkronisering.' : 'Kunne ikke starte synkroniseringen.';
    console.error('Matrikkel sync start failed', { message: error.message, code: error.code || error.cause?.code });
    return NextResponse.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
