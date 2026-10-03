import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fetchApplication } from '../lib/browser-http.js';
import { readJsonBody } from '../lib/http-body.js';
import { getApplicationOrigin, isSameOriginRequest, trustedJobOrigin } from '../lib/request-origin.js';
import { getRequestLocale } from '../lib/i18n/request.js';
import { locateProperty, propertyMapUrl } from '../lib/map/property-browser-client.js';
import { loadModule } from './helpers/load-module.mjs';
import { createRateLimiter } from '../lib/rate-limit.js';
import { trustedClientAddress } from '../lib/client-address.js';

const messages = { failed: 'translated network error', timeout: 'translated timeout', invalid: 'translated invalid response' };
test('shared browser client handles transport and malformed response failures without leaking internals', async () => {
  for (const path of ['https://evil.test/api', '//evil.test/api', '/\\evil.test/api']) {
    await assert.rejects(fetchApplication(path, {}, { ...messages, fetchImpl: () => assert.fail() }), { message: messages.failed });
  }
  let writes = 0;
  await assert.rejects(fetchApplication('/api/test', { method: 'POST' }, { ...messages, fetchImpl: async () => {
    writes++; throw new Error('secret transport diagnostic');
  } }), { message: messages.failed });
  assert.equal(writes, 1, 'uncertain writes must never be retried automatically');
  const response = await fetchApplication('/api/test', {}, { ...messages, fetchImpl: async (path, init) => {
    assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'same-origin');
    return new Response('<html>login page</html>');
  } });
  await assert.rejects(response.json(), { message: messages.invalid });
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(fetchApplication('/api/test', { signal: aborted.signal }, { ...messages,
    fetchImpl: async () => { throw aborted.signal.reason; } }), { name: 'AbortError' });
  const timeout = new AbortController(); timeout.abort(new DOMException('private detail', 'TimeoutError'));
  await assert.rejects(fetchApplication('/api/test', { signal: timeout.signal }, { ...messages,
    fetchImpl: async () => { throw timeout.signal.reason; } }), { message: messages.timeout });
});

test('JSON reader enforces MIME, object shape and streamed UTF-8 byte limits without Content-Length', async () => {
  const req = (body, type = 'application/json') => new Request('https://example.test/api', { method: 'POST', headers: { 'content-type': type }, body });
  assert.deepEqual(await readJsonBody(req('{"ok":true}', 'application/json; charset=utf-8')), { ok: true });
  await assert.rejects(readJsonBody(req('{}', 'text/plain')), { status: 415 });
  await assert.rejects(readJsonBody(req('{"text":"øøøø"}'), 15), { status: 413 });
  for (const body of ['null', '[]', 'false', '{']) await assert.rejects(readJsonBody(req(body)), { name: 'SyntaxError' });
});

test('production origins fail closed and jobs cannot dispatch secrets to a caller-controlled host', () => {
  const env = { APP_ENVIRONMENT: 'production', AUTH_URL: 'https://example.test' };
  const req = (headers) => new Request('https://internal-proxy.test/api', { method: 'POST', headers });
  assert.equal(isSameOriginRequest(req({ origin: env.AUTH_URL }), env), true);
  for (const headers of [{}, { origin: 'null' }, { origin: 'https://evil.test' }, { origin: 'https://example.test/path' },
    { origin: env.AUTH_URL, 'sec-fetch-site': 'cross-site' }]) assert.equal(isSameOriginRequest(req(headers), env), false);
  assert.equal(trustedJobOrigin('https://evil.test', env), env.AUTH_URL);
  assert.equal(getApplicationOrigin(req({}), { NODE_ENV: 'production' }), null);
  for (const AUTH_URL of ['http://example.test', 'https://user:secret@example.test', 'https://example.test/path']) {
    assert.throws(() => trustedJobOrigin('https://evil.test', { ...env, AUTH_URL }));
  }
});

test('malformed locale cookie cannot crash server request handling', () => {
  assert.equal(getRequestLocale({ headers: new Headers({ cookie: 'tfv_locale=%E0%A4%A' }) }), 'nb');
});

test('rate limit stores are bounded, expire entries and group IPv6 addresses by /64', () => {
  const limiter = createRateLimiter(2, 1000, 2);
  assert.equal(limiter.consume('a', 0), false);
  assert.equal(limiter.consume('a', 0), false);
  assert.equal(limiter.consume('a', 0), true);
  assert.equal(limiter.consume('b', 0), false);
  assert.equal(limiter.consume('c', 0), true);
  assert.equal(limiter.consume('c', 1000), false);
  const key = (ip) => trustedClientAddress(new Request('https://example.test', { headers: { 'x-nf-client-connection-ip': ip } }));
  assert.equal(key('2001:db8:1:2::1234'), key('2001:0db8:0001:0002:ffff::abcd'));
  assert.notEqual(key('2001:db8:1:2::1'), key('2001:db8:1:3::1'));
  assert.equal(key('::ffff:203.0.113.9'), '203.0.113.9');
  assert.equal(key('not-an-address'), 'unknown');
  assert.equal(key('fe80::1%en0'), 'unknown');
});

test('property map adapter restricts providers, bounds requests and rejects invalid coordinates', async () => {
  const calls = [];
  const coordinates = await locateProperty('Testvegen 1', undefined, async (url, init) => {
    calls.push(url); assert.equal(init.credentials, 'omit'); assert.equal(init.referrerPolicy, 'no-referrer');
    return Response.json(url.includes('/adresser/') ? { adresser: [{ representasjonspunkt: { epsg: 'EPSG:4258', lon: 9.5, lat: 60.4 } }] } : { x: 123, y: 456 });
  });
  assert.deepEqual(coordinates, { east: 123, north: 456 });
  assert.ok(calls.every((url) => new URL(url).hostname === 'ws.geonorge.no'));
  assert.match(propertyMapUrl('Testvegen 1', coordinates), /markerLat=456/);
  await assert.rejects(locateProperty('Testvegen 1', undefined, async () => Response.json({ adresser: [] })), /PROPERTY_MAP_COORDINATES/);
  const source = await readFile(new URL('../components/MemberPropertyMap.js', import.meta.url), 'utf8');
  assert.match(source, /if \(!enabled \|\| !streetAddress\) return/);
  assert.match(source, /enabled &&/);
});

test('CMS and activity invalidation removes stale published data immediately, not stale-while-revalidate', async () => {
  const calls = [];
  const cache = await loadModule('lib/public-content-cache.js', { 'next/cache': { revalidateTag: (...args) => calls.push(args) } });
  cache.revalidatePublicCmsContent(); cache.revalidatePublicActivityMap();
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['public-cms-content', { expire: 0 }], ['public-activity-map', { expire: 0 }]]);
});
