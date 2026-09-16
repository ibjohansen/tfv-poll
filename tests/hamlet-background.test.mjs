import test from 'node:test';
import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';
import { loadModule, plain, request } from './helpers/load-module.mjs';

const secret = 'synthetic-hamlet-job-secret';
const origin = 'https://example.test';
const trigger = { hamletId: '1', polygonVersion: 4 };
const path = '/.netlify/functions/hamlet-member-sync-background';

test('hamlet dispatch accepts only direct 202 over HTTPS with bounded secret authentication', async () => {
  for (const status of [200, 202, 204, 307, 403, 500]) {
    const calls = [];
    const api = await loadModule('lib/map/hamlet-sync-background.js', {}, {
      process: { env: { HAMLET_JOB_SECRET: secret } }, AbortSignal,
      fetch: async (url, init) => { calls.push({ url, init }); return { status, redirected: false }; },
    });
    if (status === 202) await api.dispatchHamletMemberSync(trigger, origin);
    else await assert.rejects(api.dispatchHamletMemberSync(trigger, origin), { code: 'JOB_DISPATCH_REJECTED' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.href, origin + path);
    assert.equal(calls[0].init.headers['X-Hamlet-Job-Secret'], secret);
    assert.deepEqual(JSON.parse(calls[0].init.body), trigger);
  }
});

test('hamlet dispatch rejects missing configuration, invalid triggers, unsafe origins and network errors', async () => {
  let calls = 0;
  const api = await loadModule('lib/map/hamlet-sync-background.js', {}, {
    process: { env: { HAMLET_JOB_SECRET: secret } }, AbortSignal,
    fetch: async () => { calls += 1; throw new Error(`private ${secret}`); },
  });
  for (const invalid of [{}, { hamletId: '../1', polygonVersion: 1 }, { hamletId: '1', polygonVersion: 0 }]) {
    await assert.rejects(api.dispatchHamletMemberSync(invalid, origin), { code: 'INVALID_TRIGGER' });
  }
  for (const invalid of ['http://example.test', 'https://user:pass@example.test', undefined]) {
    await assert.rejects(api.dispatchHamletMemberSync(trigger, invalid), { code: 'INVALID_JOB_ORIGIN' });
  }
  assert.equal(calls, 0);
  await assert.rejects(api.dispatchHamletMemberSync(trigger, origin), (error) => error.code === 'JOB_DISPATCH_UNAVAILABLE' && !error.message.includes(secret));
  const unconfigured = await loadModule('lib/map/hamlet-sync-background.js');
  await assert.rejects(unconfigured.dispatchHamletMemberSync(trigger, origin), { code: 'JOB_NOT_CONFIGURED' });
});

test('hamlet worker authenticates and validates before running the full rematch', async () => {
  const processed = [];
  const worker = await loadModule('netlify/functions/hamlet-member-sync-background.mjs', {
    'node:crypto': { timingSafeEqual },
    '../../lib/map/hamlet-member-sync.js': { synchronizeMemberHamlets: async (input) => {
      processed.push(plain({ trigger: input.trigger })); return { changedCount: 2 };
    } },
  }, { process: { env: { HAMLET_JOB_SECRET: secret } } });
  const call = (body, received = secret, method = 'POST') => request(path, {
    method, headers: received ? { 'x-hamlet-job-secret': received } : {},
    ...(['GET', 'HEAD'].includes(method) ? {} : { body }),
  });
  assert.equal((await worker.default(call(trigger, 'wrong'))).status, 403);
  assert.equal((await worker.default(call(trigger, secret, 'GET'))).status, 405);
  for (const body of [null, {}, [], { hamletId: '1', polygonVersion: 0 }]) {
    assert.equal((await worker.default(call(body))).status, 400);
  }
  assert.equal(processed.length, 0);
  assert.equal(worker.config.background, true);
  assert.equal((await worker.default(call(trigger))).status, 204);
  assert.deepEqual(processed, [{ trigger }]);
});

test('reviewed polygon saves queue production rematch and report dispatch failures without hiding the saved polygon', async () => {
  for (const failure of [false, true]) {
    let dispatches = 0;
    const route = await loadModule('app/api/admin/map/hamlets/route.js', {
      'next/server': { after: () => { throw new Error('production must not use after'); } },
      '@/lib/map/api': { handleMapRequest: async (req, operation) => operation(await req.json()) },
      '@/lib/map/hamlet-service': {
        getMapHamlets: async () => [],
        saveMapHamlet: async () => ({ id: '1', version: 4, reviewed: true, polygon: { type: 'Feature' } }),
      },
      '@/lib/map/hamlet-sync-background': { dispatchHamletMemberSync: async (...args) => {
        dispatches += 1; assert.deepEqual(plain(args), [trigger, origin]);
        if (failure) throw Object.assign(new Error('secret value'), { code: 'TEST' });
      } },
      '@/lib/map/hamlet-member-sync': { synchronizeMemberHamlets: async () => { throw new Error('production must not run inline'); } },
    }, { process: { env: { NODE_ENV: 'production' } } });
    const response = await route.POST(request('/api/admin/map/hamlets', { method: 'POST', body: {} }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.hamlet.id, '1');
    assert.equal(body.rematch.status, failure ? 'failed' : 'queued');
    assert.equal(dispatches, 1);
  }
});
