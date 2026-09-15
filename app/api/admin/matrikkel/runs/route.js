import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { createMatrikkelRun, getMatrikkelRun, getMatrikkelRuns } from '@/lib/matrikkel-sync';

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
    const run = await createMatrikkelRun({ hNumber: input.hNumber });
    let backgroundStarted = false;
    if (process.env.MATRIKKEL_JOB_SECRET && process.env.NODE_ENV === 'production') {
      try {
        const response = await fetch(new URL('/.netlify/functions/matrikkel-sync-background', request.nextUrl.origin), {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Matrikkel-Job-Secret': process.env.MATRIKKEL_JOB_SECRET },
          body: JSON.stringify({ runId: run.id }),
        });
        backgroundStarted = response.status === 202 || response.ok;
      } catch (error) { console.error('Matrikkel background start failed', { runId: run.id, message: error.message }); }
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
