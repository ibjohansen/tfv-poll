import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchScheduledActivityImport, startDueMonthlyActivityImport,
  validActivityMapJobSecret } from '../lib/activity-map-import-background.js';
import { loadModule } from './helpers/load-module.mjs';

const secret = 'a'.repeat(32);

test('monthly activity scheduler dispatches only a due Oslo month', async () => {
  let dispatched = null;
  const accepted = await startDueMonthlyActivityImport('https://example.test', {
    env: { ACTIVITY_MAP_JOB_SECRET: secret, APP_ENVIRONMENT: 'production', AUTH_URL: 'https://example.test' },
    now: '2026-10-01T04:00:00.000Z',
    sql: { query: async () => [{ scheduled_month: '2026-10-01' }] },
    dispatch: async (month, origin) => { dispatched = { month, origin }; },
  });
  assert.deepEqual(accepted, { result: 'accepted', scheduledMonth: '2026-10-01' });
  assert.deepEqual(dispatched, { month: '2026-10-01', origin: 'https://example.test' });
  assert.deepEqual(await startDueMonthlyActivityImport('https://example.test', {
    env: { ACTIVITY_MAP_JOB_SECRET: secret }, sql: { query: async () => [] },
  }), { result: 'idle' });
  assert.deepEqual(await startDueMonthlyActivityImport('https://example.test', {
    env: {}, sql: { query: async () => assert.fail('Missing configuration must fail closed') },
  }), { result: 'not_configured' });
});

test('activity import background dispatch requires a strong secret and direct acceptance', async () => {
  const env = { ACTIVITY_MAP_JOB_SECRET: secret, APP_ENVIRONMENT: 'production', AUTH_URL: 'https://example.test' };
  let request;
  await dispatchScheduledActivityImport('2026-10-01', 'https://example.test', { env, fetchImpl: async (url, options) => {
    request = { url: String(url), options };
    return new Response(null, { status: 202 });
  } });
  assert.equal(request.url, 'https://example.test/.netlify/functions/activity-map-import-background');
  assert.equal(request.options.headers['X-Activity-Map-Job-Secret'], secret);
  assert.equal(validActivityMapJobSecret(secret, env), true);
  assert.equal(validActivityMapJobSecret('wrong', env), false);
  await assert.rejects(dispatchScheduledActivityImport('2026-10-01', 'https://example.test', {
    env, fetchImpl: async () => new Response(null, { status: 200 }),
  }), { code: 'JOB_DISPATCH_REJECTED' });
});

test('activity import background worker rejects unauthenticated and malformed requests', async () => {
  const previous = process.env.ACTIVITY_MAP_JOB_SECRET;
  process.env.ACTIVITY_MAP_JOB_SECRET = secret;
  try {
    let scheduledMonth = null;
    const worker = await loadModule('netlify/functions/activity-map-import-background.mjs', {
      '../../lib/activity-map-import-background.js': {
        validActivityMapJobSecret: (received) => received === secret,
        runScheduledActivityImport: async (month) => { scheduledMonth = month; return { id: '1'.repeat(32), status: 'preview' }; },
      },
    });
    const url = 'https://example.test/.netlify/functions/activity-map-import-background';
    assert.equal((await worker.default(new Request(url))).status, 405);
    assert.equal((await worker.default(new Request(url, { method: 'POST', body: '{}' }))).status, 403);
    assert.equal((await worker.default(new Request(url, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Activity-Map-Job-Secret': secret,
    }, body: '{}' }))).status, 400);
    assert.equal((await worker.default(new Request(url, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Activity-Map-Job-Secret': secret,
    }, body: JSON.stringify({ scheduledMonth: '2026-10-01' }) }))).status, 204);
    assert.equal(scheduledMonth, '2026-10-01');
  } finally {
    if (previous === undefined) delete process.env.ACTIVITY_MAP_JOB_SECRET;
    else process.env.ACTIVITY_MAP_JOB_SECRET = previous;
  }
});
