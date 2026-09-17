import { getContext } from '@netlify/functions';

const FUNCTION_PATH = '/.netlify/functions/survey-email-background';

function dispatchError(code, status) {
  return Object.assign(new Error('Kunne ikke bekrefte oppstart av e-postjobben.'), { code, status });
}

export function getSurveyEmailBackgroundStatus(env = process.env) {
  // CONTEXT is a build variable, not a guaranteed Functions runtime variable.
  // Read request-local platform metadata; never infer production from a host
  // header, a local .env file or the mere presence of a job secret.
  let context;
  try { context = getContext(); } catch { return 'production_required'; }
  if (context?.deploy?.context !== 'production' || env.NETLIFY_LOCAL === 'true'
    || env.APP_ENVIRONMENT !== 'production') return 'production_required';
  if (typeof env.MAILERSEND_JOB_SECRET !== 'string' || env.MAILERSEND_JOB_SECRET.length < 32) return 'job_secret_missing';
  return 'ready';
}

export function isSurveyEmailBackgroundConfigured(env = process.env) {
  return getSurveyEmailBackgroundStatus(env) === 'ready';
}

export function requireSurveyEmailBackgroundConfigured(env = process.env) {
  if (!isSurveyEmailBackgroundConfigured(env)) throw dispatchError('JOB_NOT_CONFIGURED', 503);
  return env.MAILERSEND_JOB_SECRET;
}

export async function dispatchSurveyEmailCampaign(campaignId, origin, options = {}) {
  return dispatchSurveyJob({ campaignId }, origin, options);
}

export async function dispatchSurveyReceipts(origin, options = {}) {
  return dispatchSurveyJob({ receipts: true }, origin, options);
}

async function dispatchSurveyJob(payload, origin, options) {
  const secret = options.secret || process.env.MAILERSEND_JOB_SECRET;
  if (!secret) throw dispatchError('JOB_NOT_CONFIGURED');
  if (!payload.receipts && (typeof payload.campaignId !== 'string' || !/^[a-f0-9]{32}$/.test(payload.campaignId))) throw dispatchError('INVALID_CAMPAIGN_ID');
  let url;
  try {
    url = new URL(FUNCTION_PATH, origin);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
  } catch { throw dispatchError('INVALID_JOB_ORIGIN'); }
  let response;
  try {
    response = await fetch(url, {
      method: 'POST', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json', 'X-MailerSend-Job-Secret': secret },
      body: JSON.stringify(payload),
    });
  } catch { throw dispatchError('JOB_DISPATCH_UNAVAILABLE'); }
  if (response.status !== 202 || response.redirected) throw dispatchError('JOB_DISPATCH_REJECTED', response.status);
}
