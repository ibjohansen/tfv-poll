import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '../helpers/postgres.mjs';
import { loadModule } from '../helpers/load-module.mjs';
import * as contacts from '../../lib/member-contact-groups.js';

const db = createTestDatabase();
let groups, directory;
before(async () => {
  await db.migrate();
  const dependencies = { './db.js': { getSql: () => db.sql }, './mock-store.js': { isMockMode: () => false },
    './admin-access.js': { requirePermission: async () => ({ email: 'admin@example.test' }) } };
  groups = await loadModule('lib/member-groups.js', dependencies);
  directory = await loadModule('lib/admin-members.js', { ...dependencies, '../data/mock-members.js': { mockMembers: [] }, './member-contact-groups.js': contacts });
});
after(async () => db.close());
async function fixture() {
  const key = randomUUID();
  const members = await db.sql`INSERT INTO members (h_number, primary_contact_email, other_contact_emails, membership_status)
    VALUES (${`g1-${key}`}, ${`${key}@example.test`}, ARRAY[${`other-${key}@example.test`}], 'member'),
      (${`g2-${key}`}, ${`${key.toUpperCase()}@EXAMPLE.TEST`}, ARRAY[]::text[], 'member'),
      (${`g3-${key}`}, ${`exempt-${key}@example.test`}, ARRAY[]::text[], 'exempt') RETURNING id`;
  return { key, memberIds: members.map((member) => String(member.id)) };
}
async function create(kind) { return { ...await groups.changeMemberGroup({ action: 'create', kind, name: `Test ${randomUUID()}` }), kind }; }

test('hamlets move plots without duplicates, support filtered counts and preserve members on deletion', async () => {
  const f = await fixture();
  const first = await create('hamlet');
  const second = await create('hamlet');
  await groups.changeMemberGroup({ ...first, action: 'add', allMatching: true, search: f.key });
  let summary = (await groups.getMemberGroups()).find((group) => group.kind === 'hamlet' && group.id === first.id);
  assert.equal(summary.plot_count, 3); assert.equal(summary.member_count, 2); assert.equal(summary.email_count, 2);
  await groups.changeMemberGroup({ ...second, action: 'add', memberIds: [f.memberIds[0]] });
  const filtered = await directory.getAdminMembers('', 1, 'h_number', 'asc', false, false, { hamletId: first.id });
  assert.equal(filtered.total, 2); assert.equal(filtered.members[0].hamlet_name, first.name);
  await Promise.all([groups.changeMemberGroup({ ...first, action: 'add', memberIds: f.memberIds }), groups.changeMemberGroup({ ...second, action: 'add', memberIds: f.memberIds })]);
  const plots = await db.sql`SELECT hamlet_id FROM members WHERE id = ANY(${f.memberIds}::bigint[])`;
  assert.equal(new Set(plots.map((plot) => plot.hamlet_id)).size, 1);
  await groups.changeMemberGroup({ ...first, action: 'delete' });
  await groups.changeMemberGroup({ ...second, action: 'delete' });
  assert.equal((await db.sql`SELECT id FROM members WHERE id = ANY(${f.memberIds}::bigint[]) AND deleted_at IS NULL AND hamlet_id IS NULL`).length, 3);
  const audit = await db.sql`SELECT changed_by FROM audit_log WHERE table_name = 'members' AND row_id = ${f.memberIds[0]} ORDER BY id DESC LIMIT 1`;
  assert.equal(audit[0].changed_by, 'admin@example.test');
});

test('email groups overlap, deduplicate recipients, rename, remove and delete only membership links', async () => {
  const f = await fixture();
  const first = await create('email');
  const second = await create('email');
  await Promise.all([groups.changeMemberGroup({ ...first, action: 'add', memberIds: f.memberIds }), groups.changeMemberGroup({ ...second, action: 'add', memberIds: f.memberIds })]);
  await groups.changeMemberGroup({ ...first, action: 'add', memberIds: f.memberIds });
  const summary = (await groups.getMemberGroups()).find((group) => group.kind === 'email' && group.id === first.id);
  assert.equal(summary.plot_count, 3); assert.equal(summary.email_count, 2);
  const filtered = await directory.getAdminMembers('', 1, 'h_number', 'asc', false, false, { groupId: first.id });
  assert.equal(filtered.total, 3);
  await groups.changeMemberGroup({ ...first, action: 'rename', name: `Renamed ${randomUUID()}` });
  await groups.changeMemberGroup({ ...first, action: 'remove', memberIds: [f.memberIds[0]] });
  assert.equal((await directory.getAdminMembers('', 1, 'h_number', 'asc', false, false, { groupId: first.id })).total, 2);
  await groups.changeMemberGroup({ ...first, action: 'delete' });
  assert.equal((await db.sql`SELECT member_id FROM member_email_group_members WHERE group_id = ${second.id}`).length, 3);
  assert.equal((await db.sql`SELECT id FROM members WHERE id = ANY(${f.memberIds}::bigint[]) AND deleted_at IS NULL`).length, 3);
  const audit = await db.sql`SELECT after_value, changed_by FROM audit_log WHERE table_name = 'admin_actions'
    AND after_value->>'kind' = 'email' AND after_value->>'group_id' = ${String(first.id)} ORDER BY id`;
  assert.ok(audit.length >= 5); assert.ok(audit.every((event) => event.changed_by === 'admin@example.test'));
  assert.equal(JSON.stringify(audit.map((event) => event.after_value)).includes('@example.test'), false);
});
