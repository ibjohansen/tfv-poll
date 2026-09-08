import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicPath } from '../lib/route-access.js';
test('landing, published CMS paths, survey, auth and explicit assets can reach public handlers', () => {
 for (const path of ['/', '/arsmote-2026', '/api/cms/pages/arsmote-2026', '/api/cms/files/0123456789abcdef0123456789abcdef', '/survey', '/survey/api/responses', '/survey/dokumenter/test.pdf', '/admin/login', '/api/auth/callback/microsoft-entra-id', '/_next/static/test.js', '/_next/image', '/turufjell-vel-logo.png']) assert.equal(isPublicPath(path), true, path);
 for (const path of ['/admin', '/admin/members', '/api/members', '/future/private', '/future-page.pdf', '/api/responses', '/survey/private', '/survey/api/future', '/dokumenter/private.pdf', '/_next/data/private.json']) assert.equal(isPublicPath(path), false, path);
});
