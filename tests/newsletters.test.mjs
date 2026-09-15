import test from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { normalizeNewsletter, renderNewsletter } from '../lib/newsletter-utils.js';
import { textToRichText } from '../lib/rich-text.js';
import { loadModule, request } from './helpers/load-module.mjs';

test('newsletter validation and rendering reject injected HTML/URLs and preserve plain text', () => {
  const input = { subject: '<Test>', body: textToRichText('<script>alert(1)</script>'), groupIds: ['1', '1', '2'] };
  const result = normalizeNewsletter(input);
  assert.deepEqual(result.groupIds, ['1', '2']);
  const email = renderNewsletter({ ...result, baseUrl: 'https://example.test', isTest: true });
  assert.match(email.html, /&lt;script&gt;/); assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.subject, /^\[TEST\]/); assert.match(email.text, /<script>/);
  for (const bad of [{ ...input, subject: 'Header\r\nInjected' }, { ...input, groupIds: [] }, { ...input, groupIds: ['DROP'] }, { ...input, body: { type: 'iframe' } }]) assert.throws(() => normalizeNewsletter(bad), /Invalid newsletter/);
});
test('newsletter dispatch accepts only direct 202 with a fixed HTTPS target and no leaked network error', async () => {
  let status = 202, fail = false; const calls = [];
  const { dispatchNewsletter } = await loadModule('lib/newsletter-background.js', {}, {
    process: { env: { MAILERSEND_JOB_SECRET: 'synthetic-secret' } },
    fetch: async (url, options) => { calls.push({ url, options }); if (fail) throw new Error('private-network-detail'); return new Response(null, { status }); },
  });
  await dispatchNewsletter('a'.repeat(32), 'https://example.test');
  assert.equal(calls[0].url.pathname, '/.netlify/functions/newsletter-background'); assert.equal(calls[0].options.redirect, 'manual');
  for (status of [200, 301, 302, 307, 403, 500]) await assert.rejects(dispatchNewsletter('a'.repeat(32), 'https://example.test'), /dispatch failed/);
  await assert.rejects(dispatchNewsletter('a'.repeat(32), 'http://example.test'), /origin/);
  await assert.rejects(dispatchNewsletter('invalid', 'https://example.test'), /configured/);
  fail = true; await assert.rejects(dispatchNewsletter('a'.repeat(32), 'https://example.test'), (e) => !e.message.includes('private-network-detail'));
});
test('newsletter background endpoint rejects bad methods/secrets/IDs and resumes only its active job', async () => {
  let processed = 0, dispatched = 0;
  const env = { MAILERSEND_JOB_SECRET: 'synthetic-job-secret' };
  const handler = await loadModule('netlify/functions/newsletter-background.mjs', {
    'node:crypto': crypto,
    '../../lib/newsletters.js': { processNewsletter: async () => { processed++; return { status: 'running', workerBusy: false }; } },
    '../../lib/newsletter-background.js': { dispatchNewsletter: async () => { dispatched++; } },
  }, { process: { env } });
  assert.equal((await handler.default(request('/.netlify/functions/newsletter-background'))).status, 403);
  const headers = { 'x-mailersend-job-secret': env.MAILERSEND_JOB_SECRET };
  assert.equal((await handler.default(request('/.netlify/functions/newsletter-background', { headers }))).status, 405);
  assert.equal((await handler.default(request('/.netlify/functions/newsletter-background', { method: 'POST', headers, body: {} }))).status, 400);
  assert.equal(processed, 0);
  assert.equal((await handler.default(request('/.netlify/functions/newsletter-background', { method: 'POST', headers, body: { campaignId: 'a'.repeat(32) } }))).status, 204);
  assert.equal(processed, 1); assert.equal(dispatched, 1);
});
test('newsletter routes protect origin and surface dispatch failure as a persisted safe error', async () => {
  let error = null, failed = 0;
  const campaign = { id: 'a'.repeat(32), status: 'pending' };
  const operation = async () => { if (error) throw error; return campaign; };
  const route = await loadModule('app/api/admin/newsletters/route.js', {
    '@/lib/newsletters': { getNewsletters: operation, saveNewsletter: operation, previewNewsletter: operation,
      queueNewsletter: operation, failPendingNewsletter: async () => { failed++; return { ...campaign, status: 'failed' }; }, sendNewsletterTest: operation },
    '@/lib/newsletter-background': { dispatchNewsletter: async () => { throw new Error('private-provider-address'); } },
    '@/lib/rate-limit': { isEmailRateLimited: () => false },
  });
  const invoke = (headers = {}) => route.POST(request('/api/admin/newsletters', { method: 'POST', headers, body: { action: 'send', id: campaign.id } }));
  assert.equal((await invoke({ origin: 'https://evil.test' })).status, 403);
  const result = await invoke(); assert.equal(result.status, 503); assert.equal(failed, 1); assert.doesNotMatch(await result.text(), /private-provider/);
  error = new Error('Forbidden'); assert.equal((await invoke()).status, 403); assert.equal(failed, 1);
});
