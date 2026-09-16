import { timingSafeEqual } from 'node:crypto';
import { synchronizeMemberHamlets } from '../../lib/map/hamlet-member-sync.js';

function validSecret(received, expected) {
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export default async function handler(request) {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  if (!validSecret(request.headers.get('x-hamlet-job-secret'), process.env.HAMLET_JOB_SECRET)) {
    console.warn('Hamlet member sync authentication rejected', { occurredAt: new Date().toISOString() });
    return new Response(null, { status: 403 });
  }
  let input;
  try { input = await request.json(); } catch { return new Response(null, { status: 400 }); }
  if (!/^[1-9][0-9]{0,15}$/.test(String(input?.hamletId || ''))
    || !Number.isInteger(input?.polygonVersion) || input.polygonVersion < 1) return new Response(null, { status: 400 });

  const trigger = { hamletId: String(input.hamletId), polygonVersion: input.polygonVersion };
  console.info('Hamlet member sync started', { ...trigger, occurredAt: new Date().toISOString() });
  try {
    const result = await synchronizeMemberHamlets({ trigger, signal: AbortSignal.timeout(13 * 60 * 1_000) });
    console.info('Hamlet member sync finished', { ...trigger, ...result, occurredAt: new Date().toISOString() });
  } catch (error) {
    console.error('Hamlet member sync failed', { ...trigger, code: error.code, occurredAt: new Date().toISOString() });
    throw new Error('Hamlet member sync failed');
  }
  return new Response(null, { status: 204 });
}

export const config = { background: true };
