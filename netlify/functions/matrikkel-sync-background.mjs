import { timingSafeEqual } from 'node:crypto';
import { dispatchMatrikkelRun } from '../../lib/matrikkel-background.js';
import { processMatrikkelRun } from '../../lib/matrikkel-sync.js';

function validSecret(received, expected) {
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export default async function handler(request) {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  const secret = process.env.MATRIKKEL_JOB_SECRET;
  if (!validSecret(request.headers.get('x-matrikkel-job-secret'), secret)) {
    console.warn('Matrikkel background authentication rejected', { occurredAt: new Date().toISOString() });
    return new Response(null, { status: 403 });
  }
  let input;
  try { input = await request.json(); } catch { return new Response(null, { status: 400 }); }
  if (typeof input?.runId !== 'string' || !/^[a-f0-9]{32}$/.test(input.runId)) return new Response(null, { status: 400 });
  const deadline = Date.now() + 13 * 60 * 1000;
  let run;
  console.info('Matrikkel background processing started', { runId: input.runId, occurredAt: new Date().toISOString() });
  try {
    do { run = await processMatrikkelRun(input.runId, { batchSize: 10, deadline }); }
    while (run?.status === 'running' && !run.workerBusy && Date.now() < deadline);

    if (run?.status === 'running' && !run.workerBusy) {
      await dispatchMatrikkelRun(input.runId, new URL(request.url).origin);
      console.info('Matrikkel background continuation accepted', { runId: input.runId, occurredAt: new Date().toISOString() });
    } else {
      console.info('Matrikkel background processing finished', { runId: input.runId, status: run?.status, occurredAt: new Date().toISOString() });
    }
  } catch (error) {
    console.error('Matrikkel background processing failed', { runId: input.runId, code: error.code, occurredAt: new Date().toISOString() });
    // Kast en trygg feil slik at Netlify kan forsøke på nytt. Ikke logg
    // rå databasefeil, SOAP-svar, medlemsopplysninger eller hemmeligheter.
    throw new Error('Matrikkel background processing failed');
  }
  return new Response(null, { status: 204 });
}

export const config = { background: true };
