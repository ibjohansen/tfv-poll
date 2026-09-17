import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicPath } from '../lib/route-access.js';
test('landing, published CMS paths, survey, auth and explicit assets can reach public handlers', () => {
 assert.equal(isPublicPath('/api/locale'), true);
 for (const path of ['/', '/arsmote-2026', '/api/cms/pages/arsmote-2026', '/api/cms/files/0123456789abcdef0123456789abcdef', '/survey', '/survey/api/responses', '/api/survey/files/0123456789abcdef0123456789abcdef', '/api/usage/pageview', '/api/map/hamlets/7/properties', '/survey/dokumenter/test.pdf', '/mine-opplysninger', '/api/member-access/request', '/api/member-access/verify', '/api/member-access/profile', '/api/member-access/export', '/api/member-access/logout', '/api/member-access/email-change/verify', '/api/survey-access/verify', '/api/membership-requests', '/api/membership-requests/verify', '/api/webhooks/mailersend', '/admin/login', '/api/auth/callback/microsoft-entra-id', '/_next/static/test.js', '/_next/image', '/carousel/Ib%20Johansen_tf1.jpg', '/carousel/Ola_Nordmann_tf12.webp', '/icon.png', '/favicon.ico', '/Turufjell_liggende_VEL_logo_brun.svg', '/Turufjell_liggende_VEL_logo_creme.svg', '/Turufjell_staende_VEL_logo_brun.svg', '/Turufjell_staende_VEL_logo_creme.svg', '/turufjell-vel-logo-horizontal-dark.png', '/turufjell-vel-logo-horizontal-light.png', '/turufjell-vel-logo-stacked-dark.png', '/turufjell-vel-logo-stacked-light.png']) assert.equal(isPublicPath(path), true, path);
 for (const path of ['/admin', '/admin/members', '/api/admin/member-requests/abc', '/api/members', '/api/usage/other', '/future/private', '/future-page.pdf', '/api/responses', '/survey/private', '/survey/api/future', '/dokumenter/private.pdf', '/_next/data/private.json', '/carousel/private.jpg', '/carousel/Ib_tf0.jpg', '/carousel/nested/Ib_tf1.jpg']) assert.equal(isPublicPath(path), false, path);
});

test('admin map pages and APIs are never public', () => {
  for (const path of ['/admin/map', '/api/admin/map/search']) assert.equal(isPublicPath(path), false);
  for (const path of ['/api/map/hamlets/x/properties', '/api/map/hamlets/7/contacts', '/api/map/hamlets/7/properties/extra']) assert.equal(isPublicPath(path), false);
});
