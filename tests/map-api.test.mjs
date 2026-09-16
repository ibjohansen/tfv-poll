import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadModule, plain, request } from './helpers/load-module.mjs';
import { MapError, validatePolygon } from '../lib/map/geo.js';
import { readLimitedJson } from '../lib/map/http.js';
import { compareRegisterWithMapData } from '../lib/map/comparison.js';
import { createMapCache } from '../lib/map/cache.js';
import { normalizeCadastral, cadastralInteger, nullableText } from '../lib/map/normalization.js';
import { propertiesFromAddresses } from '../lib/map/kartverket-property-service.js';
import { normalizeKartverketAddress } from '../lib/map/kartverket-address-service.js';
import { square, rawAddress, register } from './fixtures/map.mjs';
import * as policy from '../lib/admin-policy.js';
import { isPublicPath } from '../lib/route-access.js';

async function api({ denied, limited = false } = {}) {
  return loadModule('lib/map/api.js', {
    '../admin-access.js': { requirePermission: async (permission) => { assert.equal(permission, 'members'); if (denied) throw new Error(denied); return { email: 'admin@example.invalid' }; } },
    '../rate-limit.js': { isRateLimited: () => limited }, './geo.js': { MapError }, './http.js': { readLimitedJson },
  }, { AbortSignal, SyntaxError });
}

test('map handler rejects unauthenticated and wrong-role users before parsing or external calls', async () => {
  for (const [denied, status] of [['Unauthorized', 401], ['Forbidden', 403]]) {
    const { handleMapRequest } = await api({ denied });
    const result = await handleMapRequest(request('/api/admin/map/search', { method: 'POST', rawBody: '{' }), () => assert.fail('Operation must not run'));
    assert.equal(result.status, status); assert.match(result.headers.get('Cache-Control'), /no-store/);
  }
});

test('map handler checks CSRF, content type, JSON shape and streaming body limits', async () => {
  const { handleMapRequest } = await api();
  const cases = [
    [{ body: {}, headers: { origin: 'https://evil.test' } }, 403],
    [{ body: {}, headers: { 'sec-fetch-site': 'cross-site' } }, 403],
    [{ rawBody: '{}' }, 415],
    [{ rawBody: '{', headers: { 'Content-Type': 'application/json' } }, 400],
    [{ body: null }, 400], [{ body: [] }, 400], [{ body: { text: 'x'.repeat(33000) } }, 413],
  ];
  for (const [options, status] of cases) {
    const result = await handleMapRequest(request('/api/admin/map/search', { method: 'POST', ...options }), () => assert.fail('Operation must not run'));
    assert.equal(result.status, status);
  }
});

test('map rate limits return Retry-After and service failures never expose raw errors', async () => {
  const body = { polygon: square };
  const limited = await api({ limited: true });
  const result = await limited.handleMapRequest(request('/api/admin/map/search', { method: 'POST', body }), () => assert.fail());
  assert.equal(result.status, 429); assert.equal(result.headers.get('Retry-After'), '60');
  const { handleMapRequest } = await api();
  const failed = await handleMapRequest(request('/api/admin/map/search', { method: 'POST', body }), () => { throw new Error('DATABASE_URL secret email@example.invalid'); });
  assert.equal(failed.status, 500); assert.doesNotMatch(await failed.text(), /DATABASE_URL|secret|email@example/);
});

test('actual map search route delegates through authentication and returns private JSON', async () => {
  const { handleMapRequest } = await api();
  const searchRoute = await loadModule('app/api/admin/map/search/route.js', {
    '@/lib/map/api': { handleMapRequest }, '@/lib/map/service': { searchMapData: async (input, options) => {
      assert.equal(input.datatype, 'addresses'); assert.ok(options.signal); return { addresses: [] };
    } },
  });
  const result = await searchRoute.POST(request('/api/admin/map/search', { method: 'POST', body: { datatype: 'addresses', polygon: square } }));
  assert.equal(result.status, 200); assert.deepEqual(await result.json(), { addresses: [] }); assert.equal(result.headers.get('Vary'), 'Cookie');
});

async function service({ complete = true } = {}) {
  const calls = { addresses: 0, register: [] };
  const serviceModule = await loadModule('lib/map/service.js', {
    '../mock-store.js': { isMockMode: () => false },
    './cache.js': { createMapCache }, './geo.js': { MapError, validatePolygon },
    './kartverket-address-service.js': { findAddressesInPolygon: async () => {
      calls.addresses += 1; return { complete, addresses: [normalizeKartverketAddress(rawAddress)], fetchedAt: '2026-09-15' };
    } },
    './osm-road-service.js': { findRoadsInPolygon: async () => ({ roads: [] }) },
    './kartverket-property-service.js': { propertiesFromAddresses },
    './kartverket-boundary-service.js': { findPropertiesInPolygon: async () => ({ boundaries: [], complete: true, fetchedAt: '2026-09-15' }) },
    './register-service.js': { getRegisterProperties: async (options) => { calls.register.push(options); return [{ ...register, owners: ['Internal owner'], emails: ['private@example.invalid'] }]; } },
    './comparison.js': { compareRegisterWithMapData },
  });
  return { ...serviceModule, calls };
}

test('service reuses official data, never caches register comparison and validates datatype/polygon', async () => {
  const s = await service();
  await s.searchMapData({ polygon: square, datatype: 'addresses' });
  const scoped = await s.searchMapData({ polygon: square, datatype: 'comparison', hamletId: '7' });
  await s.searchMapData({ polygon: square, datatype: 'comparison' });
  assert.equal(s.calls.addresses, 1); assert.equal(s.calls.register.length, 2);
  assert.deepEqual(plain(s.calls.register), [{ hamletId: '7' }, { hamletId: null }]);
  assert.equal(scoped.comparison.registerScope, 'hamlet');
  await assert.rejects(s.searchMapData({ polygon: square, datatype: 'https://evil.test' }));
  await assert.rejects(s.searchMapData({ polygon: square, datatype: 'addresses', hamletId: '7' }));
  await assert.rejects(s.searchMapData({ polygon: square, datatype: 'comparison', hamletId: '7 OR 1=1' }));
  await assert.rejects(s.searchMapData({ polygon: null, datatype: 'addresses' }));
});

test('incomplete official data disables comparison without querying the register', async () => {
  const s = await service({ complete: false });
  await assert.rejects(s.searchMapData({ polygon: square, datatype: 'comparison' }), (error) => error.status === 409);
  assert.equal(s.calls.register.length, 0);
});

test('register adapter projects only needed fields and excludes deleted rows, tokens and contacts by default', async () => {
  const queries = [];
  const registerModule = await loadModule('lib/map/register-service.js', {
    '../db.js': { getSql: () => async (strings, ...values) => { queries.push({ text: strings.join('?'), values }); return [{ id: 7, cadastral_number: '10/524', section_number: '2', street_address: 'Testvegen 1', primary_contact_email: 'secret@example.invalid', access_token: 'secret' }]; } },
    '../admin-access.js': { requirePermission: async (p) => assert.equal(p, 'members') },
    '../mock-store.js': { isMockMode: () => false }, '../../data/mock-members.js': { mockMembers: [] },
    './geo.js': { MapError }, './normalization.js': { cadastralInteger, normalizeCadastral, nullableText },
  });
  const [row] = await registerModule.getRegisterProperties({ hamletId: '7' });
  assert.equal(row.snr, 2); assert.equal(row.emails, undefined); assert.equal(row.access_token, undefined);
  assert.match(queries[0].text, /deleted_at IS NULL/); assert.match(queries[0].text, /hamlet_id = \?/); assert.match(queries[0].text, /LIMIT 5001/);
  assert.deepEqual(queries[0].values, ['7', '7']);
  assert.doesNotMatch(queries[0].text, /primary_contact_email|access_token|SELECT \*/);
  await assert.rejects(registerModule.getRegisterProperties({ hamletId: 'invalid' }), /gyldig grend/);
});

test('actual proxy enforces member role for map page/API and narrowly permits Kartverket image tiles', async () => {
  const env = { AUTH_SECRET: 'test', AUTH_MICROSOFT_ENTRA_ID_ID: 'test', AUTH_MICROSOFT_ENTRA_ID_SECRET: 'test',
    AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: '11111111-1111-1111-1111-111111111111',
    ADMIN_EMAILS: 'test@turufjellvel.no', ADMIN_REQUIRED_ROLES: 'TFV.ReadOnly,TFV.MemberAdmin,TFV.MatrikkelAdmin' };
  let user = { tenantId: env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID, email: 'test@turufjellvel.no', roles: ['TFV.ReadOnly'] };
  const { proxy } = await loadModule('proxy.js', {
    './auth': { auth: async () => ({ user }) },
    './lib/admin-policy': Object.fromEntries(['adminPermissions', 'isAllowedAdmin', 'isAuthConfigured'].map((name) => [name,
      name === 'isAuthConfigured' ? () => policy[name](env) : (identity) => policy[name](identity, env)])),
    './lib/route-access': { isPublicPath },
  }, { crypto: { randomUUID } });
  for (const role of ['TFV.ReadOnly', 'TFV.MatrikkelAdmin']) {
    user.roles = [role];
    assert.equal((await proxy(request('/api/admin/map/search'))).status, 403);
    assert.match((await proxy(request('/admin/map'))).headers.get('location'), /\/admin$/);
  }
  user.roles = ['TFV.MemberAdmin'];
  const allowed = await proxy(request('/admin/map'));
  assert.equal(allowed.status, 200);
  assert.match(allowed.headers.get('Content-Security-Policy'), /img-src 'self' data: blob: https:\/\/cache.kartverket.no;/);
  user = null;
  assert.equal((await proxy(request('/api/admin/map/search'))).status, 401);
});
