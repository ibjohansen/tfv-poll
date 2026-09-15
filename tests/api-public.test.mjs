import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server.js';
import { loadModule, request, routeContext } from './helpers/load-module.mjs';
import * as memberUtils from '../lib/member-self-service-utils.js';
import * as cmsValidation from '../lib/cms-validation.js';
import * as webhookUtils from '../lib/mailersend-webhook.js';

const secret = 'a'.repeat(64);
const methods = ['requestMemberAccess', 'verifyMemberAccess', 'verifyMemberEmailChange', 'createMembershipRequest', 'verifyMembershipRequest', 'getMemberSelfServiceProfile', 'getMemberSelfServiceExport', 'updateMemberSelfServiceProfile', 'requestMemberEmailChange', 'createOwnershipTransferRequest', 'revokeMemberSession'];
async function memberRoute(path) {
  const state = { result: null, error: null, limited: false, sharedLimited: false, cookie: secret };
  const calls = [], callbacks = [];
  const route = await loadModule(`app/api/${path}/route.js`, {
    'next/server': { NextResponse, after: callback => callbacks.push(callback) },
    'next/headers': { cookies: async () => ({ get: () => state.cookie ? { value: state.cookie } : undefined }) },
    '@/lib/member-self-service-utils': memberUtils,
    '@/lib/member-self-service': Object.fromEntries(methods.map(name => [name, async (...args) => {
      calls.push({ name, args });
      if (state.error) throw state.error;
      return state.result;
    }])),
    '@/lib/rate-limit': { isMemberAccessRateLimited: () => state.limited, isMemberMutationRateLimited: () => state.limited },
    '@/lib/db': { getSql: () => ({}) },
    '@/lib/shared-rate-limit': {
      PUBLIC_BROWSER_COOKIE: 'public-browser', getPublicBrowserMarker: () => ({ value: 'synthetic-marker', created: true }),
      consumeMemberAccessLimits: async () => { if (state.sharedError) throw state.sharedError; return state.sharedLimited; },
    },
  });
  return { route, state, calls, callbacks };
}

test('member access requests have one generic response, even for missing or invalid identifiers', async () => {
  const { route, calls, callbacks } = await memberRoute('member-access/request');
  let expected;
  for (const body of [{ identifier: 'H-7' }, { identifier: 'unknown@example.test' }, {}, { identifier: [] }, null]) {
    const response = await route.POST(request('/api/member-access/request', { method: 'POST', body }));
    assert.equal(response.status, 202);
    const payload = await response.json();
    expected ||= payload;
    assert.deepEqual(payload, expected);
    assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
  }
  assert.equal(calls.length, 0, 'Delivery waits until after the response');
  for (const callback of callbacks) await callback();
  assert.equal(calls.length, 5);
});

test('request origin, local/shared throttling and unavailable rate store prevent delivery', async () => {
  const { route, state, callbacks } = await memberRoute('member-access/request');
  const send = headers => route.POST(request('/api/member-access/request', { method: 'POST', body: { identifier: 'H-7' }, headers }));
  assert.equal((await send({ origin: 'https://evil.test' })).status, 403);
  state.limited = true;
  assert.equal((await send()).status, 429);
  state.limited = false; state.sharedLimited = true;
  assert.equal((await send()).status, 429);
  state.sharedLimited = false; state.sharedError = new Error('postgres://private:password@db');
  const failed = await send();
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /private|password/);
  assert.equal(callbacks.length, 0);
});

test('access verification exchanges token for cookie, strips token and clears stale cookies on failure', async () => {
  const { route, state, calls } = await memberRoute('member-access/verify');
  state.result = { secret: 'b'.repeat(64), expires_at: new Date(Date.now() + 60000).toISOString() };
  const response = await route.GET(request(`/api/member-access/verify?token=${secret}`));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'https://example.test/mine-opplysninger');
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  assert.match(response.headers.get('set-cookie'), /SameSite=lax/i);
  assert.doesNotMatch(response.headers.get('set-cookie'), new RegExp(secret));
  assert.equal(calls[0].args[0], secret);
  for (const value of [null, new Error('private connection string')]) {
    state.result = null; state.error = value;
    const failed = await route.GET(request('/api/member-access/verify'));
    assert.equal(failed.status, 303);
    assert.match(failed.headers.get('location'), /status=invalid/);
    assert.match(failed.headers.get('set-cookie'), /Max-Age=0/i);
    assert.doesNotMatch(await failed.text(), /private/);
  }
});

test('membership and email verification redirects contain status only on success and failure', async () => {
  for (const [path, parameter, success, value] of [
    ['membership-requests/verify', 'membership', 'verified', true],
    ['member-access/email-change/verify', 'emailChange', 'completed', { stage: 'completed' }],
  ]) {
    const { route, state } = await memberRoute(path);
    state.result = value;
    const ok = await route.GET(request(`/api/${path}?token=${secret}`));
    assert.equal(ok.status, 303);
    assert.equal(new URL(ok.headers.get('location')).searchParams.get(parameter), success);
    assert.doesNotMatch(ok.headers.get('location'), /token=/);
    for (const error of [null, new Error('private database error')]) {
      state.result = null; state.error = error;
      const response = await route.GET(request(`/api/${path}?token=expired`));
      assert.equal(response.status, 303);
      assert.equal(new URL(response.headers.get('location')).searchParams.get(parameter), 'invalid');
      assert.match(response.headers.get('cache-control'), /no-store/);
    }
  }
});

test('membership registration validates request shape, accepts valid requests and applies limits', async () => {
  const { route, state, calls } = await memberRoute('membership-requests');
  const send = (body, headers) => route.POST(request('/api/membership-requests', { method: 'POST', body, headers }));
  assert.equal((await send({ primary_contact_email: 'test@example.test', h_number: 'H-7' })).status, 202);
  assert.equal(calls[0].name, 'createMembershipRequest');
  for (const body of [null, [], 'invalid']) assert.equal((await send(body)).status, 400);
  assert.equal((await send({}, { origin: 'https://evil.test' })).status, 403);
  state.limited = true;
  assert.equal((await send({})).status, 429);
  state.limited = false; state.sharedLimited = true;
  assert.equal((await send({})).status, 429);
  state.sharedLimited = false; state.error = new Error('Invalid member data');
  assert.equal((await send({})).status, 400);
  state.error = new Error('postgres://secret:password@db');
  const response = await send({});
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /secret|password/);
});

test('profile actions preserve session scoping and return validation, session and conflict errors', async () => {
  const { route, state, calls } = await memberRoute('member-access/profile');
  state.result = { id: '7', primary_contact_name: 'Test' };
  for (const [action, method] of [['update', 'updateMemberSelfServiceProfile'], ['email_change', 'requestMemberEmailChange'], ['ownership_transfer', 'createOwnershipTransferRequest']]) {
    const response = await route.PATCH(request('/api/member-access/profile', { method: 'PATCH', body: { action, primary_contact_email: 'test@example.test' } }));
    assert.equal(response.status, 200);
    assert.equal(calls.at(-1).name, method);
    assert.equal(calls.at(-1).args[0], secret);
  }
  const send = (body, headers) => route.PATCH(request('/api/member-access/profile', { method: 'PATCH', body, headers }));
  for (const body of [{}, null, []]) assert.equal((await send(body)).status, 400);
  assert.equal((await send({ action: 'update' }, { origin: 'https://evil.test' })).status, 403);
  state.limited = true;
  assert.equal((await send({ action: 'update' })).status, 429);
  state.limited = false;
  for (const [error, expected] of [['Invalid member session', 401], ['Ownership request already pending', 409], ['Invalid member data', 400], ['private database password', 500]]) {
    state.error = new Error(error);
    const response = await send({ action: 'update' });
    assert.equal(response.status, expected);
    assert.doesNotMatch(await response.text(), /password/);
  }
});

test('member export requires a session, prevents caching and handles storage outages', async () => {
  const { route, state, calls } = await memberRoute('member-access/export');
  state.cookie = undefined;
  assert.equal((await route.GET()).status, 401);
  assert.equal(calls.at(-1).args[0], undefined);
  state.cookie = secret; state.result = { member: { id: '7' }, responses: [] };
  const exported = await route.GET();
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get('content-disposition'), /attachment/);
  assert.match(exported.headers.get('cache-control'), /no-store/);
  assert.equal((await exported.json()).member.id, '7');
  state.error = new Error('secret storage detail');
  const failed = await route.GET();
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /secret/);
});

test('logout clears cookies even when revocation fails and rejects cross-site requests', async () => {
  const { route, state, calls } = await memberRoute('member-access/logout');
  assert.equal((await route.POST(request('/api/member-access/logout', { method: 'POST', headers: { origin: 'https://evil.test' } }))).status, 403);
  assert.equal(calls.length, 0);
  state.error = new Error('Database unavailable');
  const response = await route.POST(request('/api/member-access/logout', { method: 'POST' }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
});

test('public CMS exposes published pages only, validates slug and masks storage errors', async () => {
  let result = { title: 'Publisert' }, error, calls = 0;
  const route = await loadModule('app/api/cms/pages/[slug]/route.js', {
    '@/lib/cms-validation': cmsValidation,
    '@/lib/cms-pages': { getPublishedCmsPage: async () => { calls++; if (error) throw error; return result; } },
  });
  assert.equal((await route.GET(null, routeContext({ slug: '../private' }))).status, 404);
  assert.equal(calls, 0);
  assert.equal((await route.GET(null, routeContext())).status, 200);
  result = null;
  assert.equal((await route.GET(null, routeContext())).status, 404);
  error = new Error('password');
  const failed = await route.GET(null, routeContext());
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /password/);
});

test('private CMS files require admin access and downloads have safe headers', async () => {
  let publicFile = null, adminFile = null, storageCalls = 0, fail = false;
  const route = await loadModule('app/api/cms/files/[id]/route.js', {
    '@/lib/cms-files': { getPublicCmsFile: async () => publicFile, getAdminCmsFile: async () => { if (!adminFile) throw new Error('Unauthorized'); return adminFile; } },
    '@/lib/cms-storage': { downloadCmsObject: async () => { storageCalls++; if (fail) throw new Error('secret storage key'); return { Body: { transformToByteArray: async () => new Uint8Array([1, 2]) } }; } },
  });
  const get = () => route.GET(request('/api/cms/files/id?download=1'), routeContext());
  assert.equal((await get()).status, 404);
  assert.equal(storageCalls, 0);
  adminFile = { storage_key: 'private-key', mime_type: 'application/pdf', size_bytes: 2, original_filename: 'Årsmøte\r\nX-Injected: true.pdf' };
  const privateResponse = await get();
  assert.equal(privateResponse.status, 200);
  assert.match(privateResponse.headers.get('cache-control'), /private, no-store/);
  assert.equal(privateResponse.headers.get('x-injected'), null);
  assert.equal(privateResponse.headers.get('x-content-type-options'), 'nosniff');
  publicFile = { ...adminFile, is_public: true };
  assert.match((await get()).headers.get('cache-control'), /public/);
  fail = true;
  const failed = await get();
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /secret/);
});

test('webhook verifies real signatures, rejects oversized/malformed payloads and retries failed persistence', async () => {
  let writes = 0, fail = false;
  const signingSecret = 'synthetic-signing-secret';
  const route = await loadModule('app/api/webhooks/mailersend/route.js', {
    '@/lib/mailersend-webhook': { ...webhookUtils, processMailerSendEvent: async () => { writes++; if (fail) throw new Error('secret'); return { outcome: 'duplicate' }; } },
  }, { process: { env: { MAILERSEND_WEBHOOK_SIGNING_SECRET: signingSecret } } });
  const send = (rawBody, headers = {}) => route.POST(request('/api/webhooks/mailersend', { method: 'POST', rawBody, headers }));
  assert.equal((await send('{')).status, 400);
  assert.equal((await send('x'.repeat(256 * 1024 + 1))).status, 413);
  assert.equal((await send('{}', { 'content-length': String(256 * 1024 + 1) })).status, 413);
  const raw = JSON.stringify({ type: 'activity.delivered', data: { id: 'event-1', message_id: 'message-1' } });
  assert.equal((await send(raw)).status, 401);
  assert.equal(writes, 0);
  const headers = { signature: createHmac('sha256', signingSecret).update(raw).digest('hex') };
  assert.equal((await send(raw, headers)).status, 204);
  assert.equal((await send(`${raw} `, headers)).status, 401);
  fail = true;
  assert.equal((await send(raw, headers)).status, 500);
  assert.equal(writes, 2);
});

test('auth route delegates GET and POST to Auth.js handlers', async () => {
  const handlers = { GET: () => new Response('get'), POST: () => new Response('post') };
  const route = await loadModule('app/api/auth/[...nextauth]/route.js', { '@/auth': { handlers } });
  assert.equal(route.GET, handlers.GET);
  assert.equal(route.POST, handlers.POST);
});
