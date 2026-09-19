import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './helpers/load-module.mjs';
import * as policy from '../lib/admin-policy.js';

test('server permission guards enforce actual tenant, allowlist and role policy', async () => {
  const env = {
    AUTH_SECRET: 'synthetic', AUTH_MICROSOFT_ENTRA_ID_ID: 'synthetic', AUTH_MICROSOFT_ENTRA_ID_SECRET: 'synthetic',
    AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: '11111111-1111-1111-1111-111111111111',
    ADMIN_EMAILS: 'test@turufjellvel.no',
    ADMIN_REQUIRED_ROLES: 'TFV.ReadOnly,TFV.MemberAdmin,TFV.SecurityAudit,TFV.MatrikkelAdmin',
  };
  let user;
  const api = await loadModule('lib/admin-access.js', {
    react: { cache: (callback) => callback },
    '../auth.js': { auth: async () => ({ user }) },
    './admin-policy.js': Object.fromEntries(['adminPermissions', 'isAllowedAdmin', 'isAllowedMatrikkelSync', 'isAuthConfigured'].map(name => [name,
      name === 'isAuthConfigured' ? () => policy[name](env) : identity => policy[name](identity, env),
    ])),
  });
  await assert.rejects(api.requirePermission('audit'), /Unauthorized/);
  user = { email: 'test@turufjellvel.no', tenantId: env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID, roles: ['TFV.ReadOnly'] };
  await api.requirePermission('read');
  for (const permission of ['members', 'surveys', 'cms', 'matrikkel', 'audit']) await assert.rejects(api.requirePermission(permission), /Forbidden/);
  user.roles = ['TFV.MemberAdmin'];
  assert.equal(await api.requirePermission('members'), user);
  await assert.rejects(api.requirePermission('audit'), /Forbidden/);
  user.roles = ['TFV.SecurityAudit'];
  assert.equal(await api.requirePermission('audit'), user);
  await assert.rejects(api.requireMatrikkelSync(), /Unauthorized/);
  user.roles = ['TFV.MatrikkelAdmin'];
  assert.equal(await api.requireMatrikkelSync(), user);
  user.tenantId = 'wrong-tenant';
  await assert.rejects(api.requireAdmin(), /Unauthorized/);
});

test('member mutations validate input and never permit editing property identity or attribution', async () => {
  const queries = [];
  let denied = false;
  let assignment = { hamlet: null, status: 'address_missing' };
  const api = await loadModule('lib/admin-member-updates.js', {
    './db.js': { getSql: () => async (strings, ...values) => { queries.push({ query: strings.join('?'), values }); return [{ id: '7' }]; } },
    './mock-store.js': { isMockMode: () => false },
    './admin-access.js': { requirePermission: async () => { if (denied) throw new Error('Forbidden'); return { email: 'admin@example.test' }; } },
    './map/member-hamlet-assignment.js': { findHamletForNewMember: async () => assignment },
  });
  await assert.rejects(api.createAdminMember({}), /H-nummer is required/);
  await assert.rejects(api.updateAdminMember('7', { other_contact_emails: 'invalid' }), /Invalid member/);
  await assert.rejects(api.updateAdminMember('7', { other_contact_emails: [], turufjell_as_sharing_opt_out: 'yes' }), /Invalid member/);
  await assert.rejects(api.updateAdminMember('bad-id', { other_contact_emails: [] }), /Invalid member/);
  assert.equal(queries.length, 0);
  await api.updateAdminMember('7', { primary_contact_name: 'Test', other_contact_emails: [], h_number: 'malicious-property', street_address: 'malicious-address', last_changed_by: 'forged-actor' });
  assert.ok(queries[0].values.includes('admin@example.test'));
  assert.doesNotMatch(JSON.stringify(queries[0].values), /malicious|forged/);
  assignment = { hamlet: { id: '13', name: 'Slåtta Øst' }, status: 'linked' };
  const created = await api.createAdminMember({ h_number: 'H13', street_address: 'Testvegen 13', other_contact_emails: [] });
  assert.ok(queries[1].values.includes('13')); assert.equal(created.hamlet_name, 'Slåtta Øst');
  denied = true;
  await assert.rejects(api.updateAdminMember('7', { other_contact_emails: [] }), /Forbidden/);
  assert.equal(queries.length, 2);
});
