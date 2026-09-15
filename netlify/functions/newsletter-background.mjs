import { timingSafeEqual } from 'node:crypto';
import { processNewsletter } from '../../lib/newsletters.js';
import { dispatchNewsletter } from '../../lib/newsletter-background.js';

export default async function handler(request) {
  const received = Buffer.from(request.headers.get('x-mailersend-job-secret') || '');
  const expected = Buffer.from(process.env.MAILERSEND_JOB_SECRET || '');
  if (!expected.length || received.length !== expected.length || !timingSafeEqual(received, expected)) return new Response(null, { status: 403 });
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  const input = await request.json().catch(() => null);
  if (!input || typeof input.campaignId !== 'string' || !/^[a-f0-9]{32}$/.test(input.campaignId)) return new Response(null, { status: 400 });
  console.info('Newsletter background started', { campaignId: input.campaignId });
  try {
    const result = await processNewsletter(input.campaignId);
    if (result.status === 'running' && !result.workerBusy) await dispatchNewsletter(input.campaignId, new URL(request.url).origin);
    console.info('Newsletter background finished', { campaignId: input.campaignId, status: result.status });
  } catch { throw new Error('Newsletter background failed'); }
  return new Response(null, { status: 204 });
}
export const config = { background: true };
