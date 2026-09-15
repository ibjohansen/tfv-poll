import test from 'node:test';
import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';
import { loadModule, plain, request } from './helpers/load-module.mjs';

const runId = 'a'.repeat(32);
const secret = 'synthetic-job-secret-not-a-real-credential';
const origin = 'https://example.test';
const functionPath = '/.netlify/functions/matrikkel-sync-background';

async function setupDispatch(options = {}) {
  const calls = [];
  const timeouts = [];
  const signal = new AbortController().signal;
  const api = await loadModule('lib/matrikkel-background.js', {}, {
    process: { env: { MATRIKKEL_JOB_SECRET: secret, ...options.env } },
    AbortSignal: { timeout: (ms) => { timeouts.push(ms); return signal; } },
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (options.error) throw options.error;
      return { status: options.status ?? 202, redirected: options.redirected ?? false };
    },
  });
  return { api, calls, timeouts, signal };
}

test('dispatch uses one bounded HTTPS request without redirects and sends only the job identity', async () => {
  const { api, calls, timeouts, signal } = await setupDispatch();
  await api.dispatchMatrikkelRun(runId, origin);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.href, origin + functionPath);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(calls[0].init.cache, 'no-store');
  assert.equal(calls[0].init.signal, signal);
  assert.deepEqual(timeouts, [10_000]);
  assert.equal(calls[0].init.headers['X-Matrikkel-Job-Secret'], secret);
  assert.deepEqual(JSON.parse(calls[0].init.body), { runId });
});

test('dispatch rejects login HTML status, redirects, errors and even a redirected 202', async () => {
  for (const status of [200, 201, 204, 301, 302, 303, 307, 308, 401, 403, 404, 429, 500, 503]) {
    const { api, calls } = await setupDispatch({ status });
    await assert.rejects(api.dispatchMatrikkelRun(runId, origin), (error) => error.code === 'JOB_DISPATCH_REJECTED' && error.status === status);
    assert.equal(calls.length, 1, `no automatic retry for ${status}`);
  }
  const { api } = await setupDispatch({ redirected: true });
  await assert.rejects(api.dispatchMatrikkelRun(runId, origin), { code: 'JOB_DISPATCH_REJECTED' });
});

test('network failure and timeout are safe errors, without raw URLs or credentials', async () => {
  for (const name of ['TypeError', 'TimeoutError']) {
    const { api } = await setupDispatch({ error: Object.assign(new Error(`https://private.test/${secret}`), { name }) });
    await assert.rejects(api.dispatchMatrikkelRun(runId, origin), (error) => {
      assert.equal(error.code, 'JOB_DISPATCH_UNAVAILABLE');
      assert.doesNotMatch(error.message, /private.test|synthetic-job/);
      return true;
    });
  }
});

test('missing configuration, invalid identity and unsafe origins fail before contacting Netlify', async () => {
  const unconfigured = await setupDispatch({ env: { MATRIKKEL_JOB_SECRET: '' } });
  await assert.rejects(unconfigured.api.dispatchMatrikkelRun(runId, origin), { code: 'JOB_NOT_CONFIGURED' });
  assert.equal(unconfigured.calls.length, 0);
  const { api, calls } = await setupDispatch();
  for (const id of ['', '../admin', null, { toString: () => runId }]) {
    await assert.rejects(api.dispatchMatrikkelRun(id, origin), { code: 'INVALID_RUN_ID' });
  }
  for (const url of [undefined, 'invalid', 'http://example.test', 'https://user:password@example.test']) {
    await assert.rejects(api.dispatchMatrikkelRun(runId, url), { code: 'INVALID_JOB_ORIGIN' });
  }
  assert.equal(calls.length, 0);
});

async function setupStart(options = {}) {
  const dispatch = await setupDispatch(options);
  const state = { created: 0, failed: 0, logs: [], run: { id: runId, status: 'pending', total_count: 426, ...options.run } };
  const route = await loadModule('app/api/admin/matrikkel/runs/route.js', {
    '@/lib/matrikkel-background': dispatch.api,
    '@/lib/matrikkel-sync': {
      createMatrikkelRun: async () => {
        if (options.denied) throw new Error('Unauthorized');
        state.created += 1;
        return { ...state.run };
      },
      failPendingMatrikkelRun: async (id) => {
        assert.equal(id, runId);
        state.failed += 1;
        Object.assign(state.run, options.concurrentStatus
          ? { status: options.concurrentStatus }
          : { status: 'failed', error_message: 'Bakgrunnsjobben kunne ikke startes.' });
        return { ...state.run };
      },
      getMatrikkelRuns: async () => [], getMatrikkelRun: async () => state.run,
    },
  }, {
    process: { env: { NODE_ENV: options.mode || 'production' } },
    console: { error: (...args) => state.logs.push(args) },
  });
  return { route, state, dispatch };
}

function startRequest(headers) {
  return request('/api/admin/matrikkel/runs', { method: 'POST', body: { hNumber: null }, headers });
}

test('production start accepts 202 but retains pending until the worker actually starts', async () => {
  const { route, state, dispatch } = await setupStart();
  const response = await route.POST(startRequest());
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.backgroundStarted, true);
  assert.equal(body.run.status, 'pending');
  assert.equal(state.failed, 0);
  assert.equal(dispatch.calls.length, 1);
});

test('production start records a visible failure for login HTML, redirects, missing secret and timeout', async () => {
  for (const options of [{ status: 200 }, { status: 307 }, { status: 404 }, { status: 503 },
    { env: { MATRIKKEL_JOB_SECRET: '' } }, { error: new Error(`private ${secret}`) }]) {
    const { route, state } = await setupStart(options);
    const response = await route.POST(startRequest());
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(body.ok, false);
    assert.equal(body.backgroundStarted, false);
    assert.equal(body.run.id, runId);
    assert.equal(body.run.status, 'failed');
    assert.match(body.message, /kunne ikke startes/);
    assert.equal(state.failed, 1);
    assert.ok(state.logs.length);
    assert.doesNotMatch(JSON.stringify({ body, logs: state.logs }), /synthetic-job|private/);
  }
});

test('lost acknowledgement never overwrites a running, completed or cancelled job or requests browser fallback', async () => {
  for (const concurrentStatus of ['running', 'completed', 'cancelled']) {
    const { route } = await setupStart({ error: new Error('timeout'), concurrentStatus });
    const response = await route.POST(startRequest());
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.run.status, concurrentStatus);
    assert.equal(body.backgroundStarted, concurrentStatus === 'running');
  }
});

test('empty selection and local development do not dispatch a background job', async () => {
  for (const options of [{ run: { status: 'completed', total_count: 0 } }, { mode: 'development' }]) {
    const { route, dispatch, state } = await setupStart(options);
    const response = await route.POST(startRequest());
    assert.equal(response.status, 201);
    assert.equal((await response.json()).backgroundStarted, false);
    assert.equal(dispatch.calls.length, 0);
    assert.equal(state.failed, 0);
  }
});

test('admin permission and same-origin checks still precede job dispatch', async () => {
  for (const options of [{ denied: true }, {}]) {
    const { route, state, dispatch } = await setupStart(options);
    const response = await route.POST(startRequest(options.denied ? {} : { origin: 'https://evil.test' }));
    assert.equal(response.status, 403);
    assert.equal(state.created, 0);
    assert.equal(state.failed, 0);
    assert.equal(dispatch.calls.length, 0);
  }
});

async function setupWorker(options = {}) {
  const state = { processed: [], continuations: [], logs: [] };
  const worker = await loadModule('netlify/functions/matrikkel-sync-background.mjs', {
    'node:crypto': { timingSafeEqual },
    '../../lib/matrikkel-background.js': { dispatchMatrikkelRun: async (...args) => {
      state.continuations.push(args);
      if (options.continuationError) throw options.continuationError;
    } },
    '../../lib/matrikkel-sync.js': { processMatrikkelRun: async (...args) => {
      state.processed.push(plain(args));
      if (options.processingError) throw options.processingError;
      return { status: options.status || 'completed' };
    } },
  }, {
    process: { env: { MATRIKKEL_JOB_SECRET: secret, ...options.env } },
    console: Object.fromEntries(['info', 'warn', 'error'].map((level) => [level, (...args) => state.logs.push([level, ...args])])),
    ...(options.clock ? { Date: options.clock } : {}),
  });
  return { worker, state };
}

function workerRequest({ method = 'POST', received = secret, rawBody = JSON.stringify({ runId }) } = {}) {
  return new Request(origin + functionPath, {
    method, headers: { ...(received == null ? {} : { 'X-Matrikkel-Job-Secret': received }), 'Content-Type': 'application/json' },
    ...(['GET', 'HEAD'].includes(method) ? {} : { body: rawBody }),
  });
}

test('worker rejects missing, wrong and unconfigured job secrets before processing any member', async () => {
  for (const options of [{ received: null }, { received: '' }, { received: 'wrong' },
    { received: 'x'.repeat(secret.length) }, { env: { MATRIKKEL_JOB_SECRET: '' } }]) {
    const { worker, state } = await setupWorker(options);
    assert.equal((await worker.default(workerRequest(options))).status, 403);
    assert.equal(state.processed.length, 0);
    assert.equal(state.continuations.length, 0);
    assert.doesNotMatch(JSON.stringify(state.logs), /synthetic-job|wrong/);
  }
});

test('worker rejects unsupported methods, malformed JSON and invalid run identities', async () => {
  const { worker, state } = await setupWorker();
  for (const method of ['GET', 'HEAD', 'DELETE']) {
    const response = await worker.default(workerRequest({ method }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'POST');
  }
  for (const rawBody of ['{', 'null', '[]', '"text"', '{}', '{"runId":1}', '{"runId":"../admin"}']) {
    assert.equal((await worker.default(workerRequest({ rawBody }))).status, 400, rawBody);
  }
  assert.equal(state.processed.length, 0);
});

test('authorized worker processes the run and logs only job metadata', async () => {
  const { worker, state } = await setupWorker();
  assert.equal(worker.config.background, true);
  assert.equal((await worker.default(workerRequest())).status, 204);
  assert.equal(state.processed.length, 1);
  assert.equal(state.processed[0][0], runId);
  assert.equal(state.processed[0][1].batchSize, 10);
  assert.equal(typeof state.processed[0][1].deadline, 'number');
  assert.equal(state.continuations.length, 0);
  assert.match(JSON.stringify(state.logs), /processing started/);
  assert.match(JSON.stringify(state.logs), /processing finished/);
  assert.doesNotMatch(JSON.stringify(state.logs), /synthetic-job/);
});

function expiredClock() {
  let calls = 0;
  return class extends Date { static now() { return calls++ === 0 ? 0 : 14 * 60 * 1000; } };
}

test('continuation uses the same verified dispatch and the current deploy origin', async () => {
  const { worker, state } = await setupWorker({ status: 'running', clock: expiredClock() });
  assert.equal((await worker.default(workerRequest())).status, 204);
  assert.deepEqual(state.continuations, [[runId, origin]]);
});

test('processing and continuation errors trigger platform retry without exposing raw errors', async () => {
  const error = Object.assign(new Error(`postgres://user:${secret}@private.test/db`), { code: 'TEST_FAILURE' });
  for (const options of [{ processingError: error }, { status: 'running', clock: expiredClock(), continuationError: error }]) {
    const { worker, state } = await setupWorker(options);
    await assert.rejects(worker.default(workerRequest()), { message: 'Matrikkel background processing failed' });
    assert.match(JSON.stringify(state.logs), /TEST_FAILURE/);
    assert.doesNotMatch(JSON.stringify(state.logs), /postgres:|private.test|synthetic-job/);
  }
});
