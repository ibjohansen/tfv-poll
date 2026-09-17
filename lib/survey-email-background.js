const FUNCTION_PATH = '/.netlify/functions/survey-email-background';

function dispatchError(code, status) {
  return Object.assign(new Error('Kunne ikke bekrefte oppstart av e-postjobben.'), { code, status });
}

export function isSurveyEmailBackgroundConfigured(env = process.env) {
  return env.CONTEXT === 'production' && env.APP_ENVIRONMENT === 'production'
    && typeof env.MAILERSEND_JOB_SECRET === 'string' && env.MAILERSEND_JOB_SECRET.length >= 32;
}

export function requireSurveyEmailBackgroundConfigured(env = process.env) {
  if (!isSurveyEmailBackgroundConfigured(env)) throw dispatchError('JOB_NOT_CONFIGURED', 503);
  return env.MAILERSEND_JOB_SECRET;
}

export async function dispatchSurveyEmailCampaign(campaignId, origin, options = {}) {
  const secret = options.secret || process.env.MAILERSEND_JOB_SECRET;
  if (!secret) throw dispatchError('JOB_NOT_CONFIGURED');
  if (typeof campaignId !== 'string' || !/^[a-f0-9]{32}$/.test(campaignId)) throw dispatchError('INVALID_CAMPAIGN_ID');
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
      body: JSON.stringify({ campaignId }),
    });
  } catch { throw dispatchError('JOB_DISPATCH_UNAVAILABLE'); }
  if (response.status !== 202 || response.redirected) throw dispatchError('JOB_DISPATCH_REJECTED', response.status);
}
