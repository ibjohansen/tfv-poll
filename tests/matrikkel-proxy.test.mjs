import 'next/dist/server/node-environment-baseline.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import nextTesting from 'next/experimental/testing/server.js';
import { loadModule, plain } from './helpers/load-module.mjs';
import { isPublicPath } from '../lib/route-access.js';

// Den installerte Next-versjonen eksporterer fortsatt det tidligere navnet.
const { unstable_doesMiddlewareMatch: doesProxyMatch } = nextTesting;

test('only the exact machine-authenticated background functions bypass the browser login proxy', async () => {
  const proxy = await loadModule('proxy.js', {
    './auth': { auth: async () => null },
    './lib/admin-policy': { adminPermissions: () => new Set(), isAllowedAdmin: () => false, isAuthConfigured: () => true },
    './lib/route-access': { isPublicPath },
  });
  const matches = (url) => doesProxyMatch({ config: plain(proxy.config), nextConfig: {}, url });
  for (const path of ['/.netlify/functions/matrikkel-sync-background', '/.netlify/functions/matrikkel-sync-background/',
    '/.netlify/functions/matrikkel-sync-background?test=1', '/.netlify/functions/survey-email-background',
    '/.netlify/functions/survey-email-background/', '/.netlify/functions/survey-email-background?test=1',
    '/.netlify/functions/newsletter-background', '/.netlify/functions/newsletter-background/']) assert.equal(matches(path), false, path);
  for (const path of ['/admin', '/admin/members/matrikkel', '/api/admin/matrikkel/runs',
    '/api/admin/matrikkel/runs/abc/process', '/admin/map', '/api/admin/map/search',
    '/.netlify/functions/other', '/.netlify/functions/newsletter-background-evil', '/.netlify/functions/newsletter-background/private', '/.netlify/functions/survey-email-background-evil', '/.netlify/functions/survey-email-background/private',
    '/.netlify/functions/matrikkel-sync-background-evil', '/.netlify/functions/matrikkel-sync-background/private',
    '/xnetlify/functions/matrikkel-sync-background', '/private/.netlify/functions/matrikkel-sync-background']) {
    assert.equal(matches(path), true, path);
    assert.equal(isPublicPath(path), false, path);
  }
});
