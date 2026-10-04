import { runScheduledActivityImport, validActivityMapJobSecret } from '../../lib/activity-map-import-background.js';

const MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-01$/;

export default async function handler(request) {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  if (!validActivityMapJobSecret(request.headers.get('x-activity-map-job-secret'))) {
    console.warn('Activity map import authentication rejected', { occurredAt: new Date().toISOString() });
    return new Response(null, { status: 403 });
  }
  let input;
  try { input = await request.json(); } catch { return new Response(null, { status: 400 }); }
  if (!MONTH_PATTERN.test(input?.scheduledMonth || '')) return new Response(null, { status: 400 });
  console.info('Activity map import started', { scheduledMonth: input.scheduledMonth, occurredAt: new Date().toISOString() });
  try {
    const result = await runScheduledActivityImport(input.scheduledMonth, { signal: AbortSignal.timeout(13 * 60 * 1_000) });
    console.info('Activity map import finished', {
      scheduledMonth: input.scheduledMonth, runId: result.id, status: result.status, existing: Boolean(result.existing),
      occurredAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Activity map import failed', {
      scheduledMonth: input.scheduledMonth, code: error.code, occurredAt: new Date().toISOString(),
    });
    throw new Error('Activity map import failed');
  }
  return new Response(null, { status: 204 });
}

export const config = { background: true };
