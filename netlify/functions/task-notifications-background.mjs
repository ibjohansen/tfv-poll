import { timingSafeEqual } from 'node:crypto';
import { processTaskNotifications } from '../../lib/task-notifications.js';

export default async function handler(request, context) {
  const received = Buffer.from(request.headers.get('x-mailersend-job-secret') || '');
  const expected = Buffer.from(process.env.MAILERSEND_JOB_SECRET || '');
  if (expected.length < 32 || received.length !== expected.length || !timingSafeEqual(received, expected)) return new Response(null, { status: 403 });
  if (context?.deploy?.context !== 'production' || process.env.APP_ENVIRONMENT !== 'production' || process.env.NETLIFY_LOCAL === 'true') return new Response(null, { status: 403 });
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  try {
    const result = await processTaskNotifications();
    console.info('Task notifications background finished', result);
  } catch { throw new Error('Task notifications background failed'); }
  return new Response(null, { status: 204 });
}
export const config = { background: true };
