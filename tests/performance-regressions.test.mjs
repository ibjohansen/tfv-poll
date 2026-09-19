import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadModule } from './helpers/load-module.mjs';

test('public shell stays independent of auth while waiting for the CSP nonce request', async () => {
  const [layout, page, cookies] = await Promise.all([
    readFile(new URL('../app/layout.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/page.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/informasjonskapsler/page.js', import.meta.url), 'utf8'),
  ]);
  for (const source of [layout, page, cookies]) {
    assert.doesNotMatch(source, /\bauth\s*\(|\bheaders\s*\(|\bcookies\s*\(|getServerI18n/);
  }
  assert.match(layout, /await connection\(\)/);
});

test('public map mounts automatically while keeping Leaflet in a dynamic client bundle', async () => {
  const source = await readFile(new URL('../components/PublicHamletMap.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /IntersectionObserver/);
  assert.doesNotMatch(source, /onClick=\{openMap\}/);
  assert.match(source, /dynamic\(\(\) => import\('\.\/PublicHamletMapView'\)/);
  assert.match(source, /ssr:\s*false/);
});

test('admin session lookup is shared by permission checks in one request', async () => {
  let authCalls = 0;
  let cached;
  const user = { email: 'admin@example.test' };
  const api = await loadModule('lib/admin-access.js', {
    react: { cache: (callback) => async () => { cached ??= callback(); return cached; } },
    '../auth.js': { auth: async () => { authCalls += 1; return { user }; } },
    './admin-policy.js': {
      isAuthConfigured: () => true,
      isAllowedAdmin: () => true,
      isAllowedMatrikkelSync: () => true,
      adminPermissions: () => new Set(['members']),
    },
  });
  await Promise.all([api.requireAdmin(), api.requirePermission('members'), api.requireMatrikkelSync()]);
  assert.equal(authCalls, 1);
});
