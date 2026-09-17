import { timingSafeEqual } from 'node:crypto';
import { processSurveyEmailCampaign } from '../../lib/survey-email.js';
import { dispatchSurveyEmailCampaign } from '../../lib/survey-email-background.js';

function validSecret(received, expected) {
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export default async function handler(request) {
  const secret = process.env.MAILERSEND_JOB_SECRET;
  if (!validSecret(request.headers.get('x-mailersend-job-secret'), secret)) return new Response(null, { status: 403 });
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  let input;
  try { input = await request.json(); } catch { return new Response(null, { status: 400 }); }
  if (!input || typeof input.campaignId !== 'string' || !/^[a-f0-9]{32}$/.test(input.campaignId)) return new Response(null, { status: 400 });

  let campaign;
  console.info('Survey email background started', { campaignId: input.campaignId });
  try {
    campaign = await processSurveyEmailCampaign(input.campaignId, { batchSize: 100 });
  } catch (error) {
    console.error('Survey email background failed', { campaignId: input.campaignId, code: error.code || error.cause?.code, occurredAt: new Date().toISOString() });
    // Throwing signals invocation failure to Netlify's background retry policy.
    // Never propagate provider responses, email addresses or tokens into logs.
    throw new Error('Survey email background failed');
  }

  if (campaign?.status === 'running' && !campaign.workerBusy) {
    await dispatchSurveyEmailCampaign(input.campaignId, new URL(request.url).origin, { secret });
  }
  console.info('Survey email background finished', { campaignId: input.campaignId, status: campaign?.status, workerBusy: Boolean(campaign?.workerBusy) });
  return new Response(null, { status: 204 });
}

export const config = { background: true };
