import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  deviceCategoryForWidth, normalizeUsageBatch, normalizeUsageEvent, normalizeUsagePeriod, pageTypeForPath,
} from '../lib/usage-metrics.js';
import * as usageMetrics from '../lib/usage-metrics.js';
import { loadModule, plain, request } from './helpers/load-module.mjs';
import { isPublicPath } from '../lib/route-access.js';
import * as policy from '../lib/admin-policy.js';
import { isSameOriginRequest } from '../lib/request-origin.js';

test('public paths are reduced to an allowlisted page type without URL details', () => {
  assert.equal(pageTypeForPath('/'), 'home');
  assert.equal(pageTypeForPath('/survey'), 'survey');
  assert.equal(pageTypeForPath('/mine-opplysninger/'), 'self_service');
  assert.equal(pageTypeForPath('/arsmote-2026'), 'article');
  for (const path of ['/admin', '/admin/members', '/api/usage/pageview', '/documents/file.pdf', null]) {
    assert.equal(pageTypeForPath(path), null);
  }
});

test('viewport is reduced to fixed coarse categories', () => {
  assert.equal(deviceCategoryForWidth(390), 'mobile');
  assert.equal(deviceCategoryForWidth(768), 'tablet');
  assert.equal(deviceCategoryForWidth(1099), 'tablet');
  assert.equal(deviceCategoryForWidth(1100), 'desktop');
  assert.equal(deviceCategoryForWidth(Number.NaN), 'unknown');
});

test('usage input only accepts fixed aggregate dimensions and periods', () => {
  assert.deepEqual(normalizeUsageEvent({ pageType: 'home', deviceCategory: 'mobile' }), { pageType: 'home', deviceCategory: 'mobile' });
  for (const input of [{}, { pageType: 'home', deviceCategory: 'mobile', path: '/secret' }, { pageType: '/survey', deviceCategory: 'desktop' }]) {
    assert.throws(() => normalizeUsageEvent(input), /Invalid usage event/);
  }
  assert.equal(normalizeUsagePeriod(undefined), 30);
  assert.equal(normalizeUsagePeriod('365'), 365);
  assert.equal(normalizeUsagePeriod('all'), 'all');
  assert.throws(() => normalizeUsagePeriod('31'), /Invalid usage period/);
  assert.deepEqual(normalizeUsageBatch({ events: [{ pageType: 'article', deviceCategory: 'tablet' }], webVitals: [{ name: 'LCP', value: 1234.5678, rating: 'good', deviceCategory: 'tablet' }] }), {
    events: [{ pageType: 'article', deviceCategory: 'tablet' }],
    webVitals: [{ name: 'LCP', value: 1234.568, rating: 'good', deviceCategory: 'tablet' }],
  });
  assert.throws(() => normalizeUsageBatch({ events: [], webVitals: [{ name: 'FID', value: 4, rating: 'good', deviceCategory: 'mobile' }] }), /Invalid web vital/);
});

test('pageview endpoint requires same origin and exposes no storage error details', async () => {
  const calls = [];
  const route = await loadModule('app/api/usage/pageview/route.js', {
    '@/lib/usage-statistics': { recordUsagePageView: async (value) => calls.push(value), recordUsageBatch: async (value) => calls.push(value) },
    '@/lib/usage-metrics': { normalizeUsageEvent, normalizeUsageBatch },
  });
  const headers = { origin: 'https://example.test', 'sec-fetch-site': 'same-origin' };
  const accepted = await route.POST(request('/api/usage/pageview', { method: 'POST', headers, body: { pageType: 'home', deviceCategory: 'mobile' } }));
  assert.equal(accepted.status, 204);
  assert.deepEqual(calls, [{ pageType: 'home', deviceCategory: 'mobile' }]);
  const batch = { events: [{ pageType: 'article', deviceCategory: 'desktop' }], webVitals: [{ name: 'CLS', value: 0.01, rating: 'good', deviceCategory: 'desktop' }] };
  assert.equal((await route.POST(request('/api/usage/pageview', { method: 'POST', headers, body: batch }))).status, 204);
  assert.deepEqual(calls[1], batch);
  assert.equal((await route.POST(request('/api/usage/pageview', { method: 'POST', headers: { origin: 'https://evil.test' }, body: {} }))).status, 403);

  const invalid = await route.POST(request('/api/usage/pageview', { method: 'POST', headers, body: { pageType: 'home', deviceCategory: 'mobile', url: '/member-link' } }));
  assert.equal(invalid.status, 400);

  const failedRoute = await loadModule('app/api/usage/pageview/route.js', {
    '@/lib/usage-statistics': { recordUsagePageView: async () => { throw new Error('DATABASE_URL=secret'); }, recordUsageBatch: async () => {} },
    '@/lib/usage-metrics': { normalizeUsageEvent, normalizeUsageBatch },
  });
  const failed = await failedRoute.POST(request('/api/usage/pageview', { method: 'POST', headers, body: { pageType: 'home', deviceCategory: 'desktop' } }));
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /DATABASE_URL|secret/);
});

test('pageview endpoint accepts the configured public origin behind Netlify proxying', async () => {
  const calls = [];
  const publicOrigin = 'https://medlemsservice.turufjellvel.no';
  const route = await loadModule('app/api/usage/pageview/route.js', {
    '@/lib/usage-statistics': { recordUsagePageView: async (value) => calls.push(value), recordUsageBatch: async (value) => calls.push(value) },
    '@/lib/usage-metrics': { normalizeUsageEvent, normalizeUsageBatch },
    '@/lib/request-origin': {
      isSameOriginRequest: (requestValue) => isSameOriginRequest(requestValue, { AUTH_URL: publicOrigin }),
    },
  });
  const response = await route.POST(request('https://internal-deploy.example/api/usage/pageview', {
    method: 'POST',
    headers: { origin: publicOrigin, 'sec-fetch-site': 'same-origin' },
    body: { pageType: 'home', deviceCategory: 'desktop' },
  }));
  assert.equal(response.status, 204);
  assert.deepEqual(calls, [{ pageType: 'home', deviceCategory: 'desktop' }]);
});

test('usage collection is public but its dashboard requires audit permission', async () => {
  assert.equal(isPublicPath('/api/usage/pageview'), true);
  assert.equal(isPublicPath('/api/usage/anything-else'), false);
  const env = {
    AUTH_SECRET: 'test', AUTH_MICROSOFT_ENTRA_ID_ID: 'test', AUTH_MICROSOFT_ENTRA_ID_SECRET: 'test',
    AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: '11111111-1111-1111-1111-111111111111',
    ADMIN_EMAILS: 'test@turufjellvel.no', ADMIN_REQUIRED_ROLES: 'TFV.ReadOnly,TFV.SecurityAudit',
  };
  const user = { tenantId: env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID, email: 'test@turufjellvel.no', roles: ['TFV.ReadOnly'] };
  const { proxy } = await loadModule('proxy.js', {
    './auth': { auth: async () => ({ user }) },
    './lib/admin-policy': Object.fromEntries(['adminPermissions', 'isAllowedAdmin', 'isAuthConfigured'].map((name) => [name,
      name === 'isAuthConfigured' ? () => policy[name](env) : (identity) => policy[name](identity, env)])),
    './lib/route-access': { isPublicPath },
  }, { crypto: { randomUUID } });
  assert.match((await proxy(request('/admin/usage'))).headers.get('location'), /\/admin$/);
  user.roles = ['TFV.SecurityAudit'];
  assert.equal((await proxy(request('/admin/usage'))).status, 200);
});

test('usage service writes one aggregate dimension pair and returns normalized totals', async () => {
  const queries = [];
  const permissions = [];
  const sql = { query: async (query, values) => {
    queries.push({ query, values });
    if (query.includes('INSERT INTO usage_daily_stats')) return [];
    return [
      { kind: 'bounds', label: '2026-09-01', secondary: '2026-09-07', views: '0' },
      { kind: 'total', label: 'total', secondary: null, views: '5' },
      { kind: 'trend', label: '2026-09-07', secondary: null, views: '5' },
      { kind: 'page', label: 'article', secondary: null, views: '2' },
      { kind: 'page', label: 'home', secondary: null, views: '3' },
      { kind: 'device', label: 'desktop', secondary: null, views: '5' },
    ];
  } };
  const service = await loadModule('lib/usage-statistics.js', {
    './admin-access.js': { requirePermission: async (permission) => permissions.push(permission) },
    './db.js': { getSql: () => sql },
    './mock-store.js': { isMockMode: () => false },
    './usage-metrics.js': usageMetrics,
  });
  await service.recordUsagePageView({ pageType: 'home', deviceCategory: 'desktop' });
  assert.deepEqual(plain(queries[0].values), ['[{"page_type":"home","device_category":"desktop"}]', '[]']);
  assert.match(queries[0].query, /ON CONFLICT[\s\S]*views = usage_daily_stats\.views \+ EXCLUDED\.views/);
  assert.doesNotMatch(queries[0].query, /ip_address|user_agent|referrer|visitor|session/i);
  const result = await service.getUsageStatistics({ days: 7 });
  assert.deepEqual(permissions, ['audit']);
  assert.deepEqual(plain(result.pages), [{ pageType: 'home', views: 3 }, { pageType: 'article', views: 2 }]);
  assert.equal(result.total, 5);
  assert.equal(result.trend[0].date, '2026-09-07');
  assert.equal(result.granularity, 'day');
});
