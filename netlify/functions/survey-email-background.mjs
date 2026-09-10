import { timingSafeEqual } from 'node:crypto';
import { processSurveyEmailCampaign } from '../../lib/survey-email.js';

function validSecret(received, expected) {
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export default async function handler(request) {
  const secret = process.env.MAILERSEND_JOB_SECRET;
  if (!validSecret(request.headers.get('x-mailersend-job-secret'), secret)) return new Response(null, { status: 403 });
  let input;
  try { input = await request.json(); } catch { return new Response(null, { status: 400 }); }
  if (!/^[a-f0-9]{32}$/i.test(input.campaignId || '')) return new Response(null, { status: 400 });

  let campaign;
  try {
    campaign = await processSurveyEmailCampaign(input.campaignId, { batchSize: 100 });
  } catch (error) {
    console.error('Survey email background failed', { campaignId: input.campaignId, code: error.code || error.cause?.code, occurredAt: new Date().toISOString() });
    return new Response(null, { status: 500 });
  }

  if (campaign?.status === 'running' && !campaign.workerBusy && process.env.URL) {
    await fetch(`${process.env.URL}/.netlify/functions/survey-email-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-MailerSend-Job-Secret': secret },
      body: JSON.stringify({ campaignId: input.campaignId }),
    });
  }
  return new Response(null, { status: 204 });
}

export const config = { background: true };
