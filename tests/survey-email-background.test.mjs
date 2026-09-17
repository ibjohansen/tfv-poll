import test from 'node:test';
import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';
import { loadModule, request, routeContext } from './helpers/load-module.mjs';

const campaignId = 'a'.repeat(32);
const secret = 'test-only-job-secret';
const origin = 'https://example.test';

test('bulk email requires the production context and a strong job secret', async () => {
  const api = await loadModule('lib/survey-email-background.js');
  const configured = { CONTEXT: 'production', APP_ENVIRONMENT: 'production', MAILERSEND_JOB_SECRET: 'x'.repeat(32) };
  assert.equal(api.isSurveyEmailBackgroundConfigured(configured), true);
  for (const env of [
    {},
    { ...configured, CONTEXT: 'dev' },
    { ...configured, APP_ENVIRONMENT: 'development' },
    { ...configured, MAILERSEND_JOB_SECRET: 'too-short' },
  ]) {
    assert.equal(api.isSurveyEmailBackgroundConfigured(env), false);
    assert.throws(() => api.requireSurveyEmailBackgroundConfigured(env), { code: 'JOB_NOT_CONFIGURED', status: 503 });
  }
  assert.equal(api.requireSurveyEmailBackgroundConfigured(configured), configured.MAILERSEND_JOB_SECRET);
});

test('email dispatch accepts only a direct 202 with a bounded, secret-authenticated request', async () => {
  for (const status of [200, 202, 204, 301, 307, 403, 429, 500]) {
    const api = await loadModule('lib/survey-email-background.js', {}, {
      process: { env: { MAILERSEND_JOB_SECRET: secret } }, AbortSignal,
      fetch: async (url, init) => {
        assert.equal(url.href, `${origin}/.netlify/functions/survey-email-background`);
        assert.equal(init.redirect, 'manual');
        assert.equal(init.headers['X-MailerSend-Job-Secret'], secret);
        assert.equal(init.signal.aborted, false);
        assert.deepEqual(JSON.parse(init.body), { campaignId });
        return { status };
      },
    });
    if (status === 202) await api.dispatchSurveyEmailCampaign(campaignId, origin);
    else await assert.rejects(api.dispatchSurveyEmailCampaign(campaignId, origin), { code: 'JOB_DISPATCH_REJECTED' });
  }
});

test('email dispatch can use the secret captured before asynchronous campaign setup', async () => {
  const capturedSecret = 'captured-before-await-job-secret';
  const api = await loadModule('lib/survey-email-background.js', {}, {
    process: { env: {} }, AbortSignal,
    fetch: async (_url, init) => {
      assert.equal(init.headers['X-MailerSend-Job-Secret'], capturedSecret);
      return { status: 202, redirected: false };
    },
  });
  await api.dispatchSurveyEmailCampaign(campaignId, origin, { secret: capturedSecret });
});

test('email dispatch rejects missing secrets, invalid origins/IDs and redacts network failures', async () => {
  let calls = 0;
  const api = await loadModule('lib/survey-email-background.js', {}, {
    process: { env: { MAILERSEND_JOB_SECRET: secret } }, AbortSignal,
    fetch: async () => { calls++; throw new Error('https://private.test/secret'); },
  });
  for (const id of [null, '', {}, 'A'.repeat(32)]) await assert.rejects(api.dispatchSurveyEmailCampaign(id, origin), { code: 'INVALID_CAMPAIGN_ID' });
  for (const url of ['http://example.test', 'https://user:pass@example.test', undefined]) await assert.rejects(api.dispatchSurveyEmailCampaign(campaignId, url), { code: 'INVALID_JOB_ORIGIN' });
  assert.equal(calls, 0);
  await assert.rejects(api.dispatchSurveyEmailCampaign(campaignId, origin), (error) => error.code === 'JOB_DISPATCH_UNAVAILABLE' && !error.message.includes('private.test'));
  const unconfigured = await loadModule('lib/survey-email-background.js');
  await assert.rejects(unconfigured.dispatchSurveyEmailCampaign(campaignId, origin), { code: 'JOB_NOT_CONFIGURED' });
});

test('email worker guards method/secret/body and forwards only a non-busy running job', async () => {
  let processed = 0;
  let forwarded = 0;
  let result = { status: 'running', workerBusy: true };
  const worker = await loadModule('netlify/functions/survey-email-background.mjs', {
    'node:crypto': { timingSafeEqual },
    '../../lib/survey-email.js': { processSurveyEmailCampaign: async () => { processed++; return result; } },
    '../../lib/survey-email-background.js': { dispatchSurveyEmailCampaign: async (id, base, options) => {
      assert.equal(id, campaignId); assert.equal(base, origin); assert.equal(options.secret, secret); forwarded++;
    } },
  }, { process: { env: { MAILERSEND_JOB_SECRET: secret } } });
  const path = '/.netlify/functions/survey-email-background';
  assert.equal((await worker.default(request(path, { method: 'POST', body: { campaignId } }))).status, 403);
  const headers = { 'x-mailersend-job-secret': secret };
  assert.equal((await worker.default(request(path, { headers }))).status, 405);
  for (const body of [null, {}, [], { campaignId: 7 }]) assert.equal((await worker.default(request(path, { method: 'POST', headers, body }))).status, 400);
  assert.equal(processed, 0);
  await worker.default(request(path, { method: 'POST', headers, body: { campaignId } }));
  assert.equal(forwarded, 0);
  result = { status: 'running' };
  await worker.default(request(path, { method: 'POST', headers, body: { campaignId } }));
  assert.equal(forwarded, 1);
  result = { status: 'completed' };
  await worker.default(request(path, { method: 'POST', headers, body: { campaignId } }));
  assert.equal(forwarded, 1);
});

test('production email route shows failed dispatch but preserves a concurrently started campaign', async () => {
  for (const status of ['failed', 'running', 'completed']) {
    const route = await loadModule('app/api/admin/surveys/[id]/email/route.js', {
      '@/lib/survey-email': {
        getSurveyEmailOverview: async () => ({}), sendSurveyTestEmail: async () => ({}),
        createSurveyEmailCampaign: async () => ({ campaign: { id: campaignId, status: 'pending' } }),
        failPendingSurveyEmailCampaign: async () => ({ id: campaignId, status }),
      },
      '@/lib/survey-email-background': {
        dispatchSurveyEmailCampaign: async (_id, _origin, options) => {
          assert.equal(options.secret, secret);
          throw new Error('dispatch failed');
        },
        requireSurveyEmailBackgroundConfigured: () => secret,
      },
      '@/lib/rate-limit': { isEmailRateLimited: () => false },
    }, { process: { env: { NODE_ENV: 'production' } } });
    const response = await route.POST(request(`/api/admin/surveys/${campaignId}/email`, { method: 'POST', body: { action: 'send' } }), routeContext());
    assert.equal(response.status, status === 'failed' ? 503 : 201);
    assert.equal((await response.json()).backgroundStarted, status !== 'failed');
  }
});

test('email route rejects non-production bulk sending before creating a campaign', async () => {
  let created = 0;
  const route = await loadModule('app/api/admin/surveys/[id]/email/route.js', {
    '@/lib/survey-email': {
      createSurveyEmailCampaign: async () => { created++; return {}; },
      failPendingSurveyEmailCampaign: async () => null,
      getSurveyEmailOverview: async () => ({}),
      sendSurveyTestEmail: async () => ({}),
    },
    '@/lib/survey-email-background': {
      dispatchSurveyEmailCampaign: async () => assert.fail('Unexpected dispatch'),
      requireSurveyEmailBackgroundConfigured: () => {
        throw Object.assign(new Error('Not configured'), { code: 'JOB_NOT_CONFIGURED', status: 503 });
      },
    },
    '@/lib/rate-limit': { isEmailRateLimited: () => false },
  });
  const response = await route.POST(request(`/api/admin/surveys/${campaignId}/email`, {
    method: 'POST', body: { action: 'send', groupId: '71' },
  }), routeContext());
  assert.equal(response.status, 503);
  assert.equal(created, 0);
});
