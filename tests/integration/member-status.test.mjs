import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '../helpers/postgres.mjs';
import { loadModule } from '../helpers/load-module.mjs';
import * as contactGroups from '../../lib/member-contact-groups.js';
import { createAccessSecret, hashAccessSecret } from '../../lib/member-self-service-utils.js';
import { getSurveyAccess, submitSurveyResponse } from '../../lib/membership.js';
import { memberTestEnvironment as env } from '../helpers/member-service.mjs';

const db = createTestDatabase();
let admin;
let directory;
let nextHamletAssignment = { hamlet: null, status: 'address_missing' };
before(async () => {
  await db.migrate();
  const dependencies = { './db.js': { getSql: () => db.sql }, './mock-store.js': { isMockMode: () => false },
    './admin-access.js': { requirePermission: async () => ({ email: 'admin@example.test' }) },
    './map/member-hamlet-assignment.js': { findHamletForNewMember: async () => nextHamletAssignment } };
  admin = await loadModule('lib/admin-member-updates.js', dependencies);
  directory = await loadModule('lib/admin-members.js', { ...dependencies,
    '../data/mock-members.js': { mockMembers: [] }, './member-contact-groups.js': contactGroups });
});
after(async () => { await db.close(); });

test('new member persists an unambiguous automatic hamlet assignment', async () => {
  const [hamlet] = await db.sql`INSERT INTO member_hamlets(name) VALUES (${`Auto-${randomUUID()}`}) RETURNING id,name`;
  nextHamletAssignment = { hamlet, status: 'linked' };
  try {
    const member = await admin.createAdminMember({ h_number: `auto-${randomUUID()}`, street_address: 'Testvegen 1', other_contact_emails: [] });
    assert.equal(String(member.hamlet_id), String(hamlet.id)); assert.equal(member.hamlet_name, hamlet.name);
    const [stored] = await db.sql`SELECT hamlet_id FROM members WHERE id=${member.id}`;
    assert.equal(String(stored.hamlet_id), String(hamlet.id));
  } finally { nextHamletAssignment = { hamlet: null, status: 'address_missing' }; }
});

test('member status defaults safely, validates changes, filters/counts and preserves separate shared-email properties', async () => {
  const key = randomUUID();
  const input = { h_number: `test-${key}`, primary_contact_name: 'Test En', primary_contact_email: `${key}@example.test`, other_contact_emails: [] };
  const first = await admin.createAdminMember(input);
  assert.equal(first.membership_status, 'member');
  const second = await admin.createAdminMember({ ...input, h_number: `test2-${key}`, membership_status: 'exempt', primary_contact_name: 'Test To' });
  const all = await directory.getAdminMembers(key);
  assert.equal(all.total, 2);
  assert.equal(all.members[0].shared_email_groups[0].properties.length, 2);
  const exempt = await directory.getAdminMembers(key, 1, 'h_number', 'asc', false, false, { membershipStatus: 'exempt' });
  assert.equal(exempt.total, 1);
  assert.equal(exempt.members[0].id, second.id);
  const unassigned = await directory.getAdminMembers(key, 1, 'h_number', 'asc', false, false, { hamletId: 'unassigned' });
  assert.equal(unassigned.total, 2);
  assert.ok(unassigned.members.every((member) => member.hamlet_id === null));
  await admin.updateAdminMember(String(second.id), { ...input, primary_contact_name: 'Oppdatert' });
  assert.equal((await directory.getAdminMemberById(String(second.id))).membership_status, 'exempt', 'omitted status preserves current value');
  await assert.rejects(admin.updateAdminMember(String(first.id), { ...input, membership_status: 'invalid' }), /Invalid member/);
  const events = await db.sql`SELECT after_value FROM audit_log WHERE table_name = 'members' AND row_id = ${String(second.id)} ORDER BY id`;
  assert.equal(events[0].after_value.membership_status, 'exempt');
});

test('sharing reservation defaults off, records its change and can be filtered', async () => {
  const key = randomUUID();
  const input = { h_number: `sharing-${key}`, primary_contact_name: 'Test', primary_contact_email: `${key}@example.test`, other_contact_emails: [] };
  const member = await admin.createAdminMember(input);
  assert.equal(member.turufjell_as_sharing_opt_out, false);
  const updated = await admin.updateAdminMember(String(member.id), { ...input, turufjell_as_sharing_opt_out: true });
  assert.equal(updated.turufjell_as_sharing_opt_out, true);
  assert.ok(updated.turufjell_as_sharing_opt_out_updated_at);
  const reserved = await directory.getAdminMembers(key, 1, 'h_number', 'asc', false, false, { turufjellAsSharing: 'opted_out' });
  assert.equal(reserved.total, 1);
  const allowed = await directory.getAdminMembers(key, 1, 'h_number', 'asc', false, false, { turufjellAsSharing: 'allowed' });
  assert.equal(allowed.total, 0);
  const events = await db.sql`SELECT after_value FROM audit_log WHERE table_name = 'members' AND row_id = ${String(member.id)} ORDER BY id`;
  assert.equal(events.at(-1).after_value.turufjell_as_sharing_opt_out, true);
});

test('indexed member search keeps Norwegian text, SPG H-numbers and literal wildcard characters searchable', async () => {
  const key = randomUUID();
  const member = await admin.createAdminMember({
    h_number: `SPG H 987 ${key}`,
    cadastral_number: '32/481',
    section_number: '7',
    street_address: `Øvre Åsveg ${key}`,
    title_holder: 'Sæter og Sønn',
    primary_contact_name: 'Åse Ødegård',
    primary_contact_email: `${key}@example.test`,
    other_contact_emails: [`blåbær-${key}@example.test`],
    admin_comment: `Kontrollert 100% ${key}`,
    membership_status: 'exempt',
    turufjell_as_sharing_opt_out: true,
  });
  for (const search of ['SPG H 987', '32/481', 'Øvre Åsveg', 'Sæter', 'Åse Ødegård', `blåbær-${key}`, '100%']) {
    const result = await directory.getAdminMembers(search, 1, 'h_number', 'asc', false, true, { membershipStatus: 'exempt', turufjellAsSharing: 'opted_out' });
    assert.ok(result.members.some(({ id }) => String(id) === String(member.id)), search);
  }
});

async function surveyFixture() {
  const member = await admin.createAdminMember({ h_number: `survey-test-${randomUUID()}`, primary_contact_email: `${randomUUID()}@example.test`, other_contact_emails: [] });
  const surveyId = randomUUID().replaceAll('-', '');
  await db.sql`INSERT INTO surveys (id, title, is_open, ends_on, question_version, questions)
    VALUES (${surveyId}, 'Syntetisk survey', TRUE, '2099-12-31', 1, '[{"id":"q1","text":"Syntetisk spørsmål"}]')`;
  const secret = createAccessSecret();
  await db.sql`INSERT INTO survey_sessions (id, member_id, survey_id, session_token_hash, environment, audience, expires_at, absolute_expires_at)
    VALUES (${randomUUID().replaceAll('-', '')}, ${member.id}, ${surveyId}, ${hashAccessSecret(secret)}, 'development', ${env.TOKEN_AUDIENCE}, NOW() + INTERVAL '45 minutes', NOW() + INTERVAL '4 hours')`;
  return { member, surveyId, secret };
}

test('exemption invalidates survey access and blocks an already-open form at the final write', async () => {
  const f = await surveyFixture();
  assert.equal((await getSurveyAccess(f.secret, { sql: db.sql, env })).status, 'ready');
  let changed = false;
  const sql = async (strings, ...values) => {
    if (!changed && strings.join('').includes('INSERT INTO survey_responses')) {
      changed = true;
      await admin.updateAdminMember(String(f.member.id), { other_contact_emails: [], membership_status: 'exempt' });
    }
    return await db.sql(strings, ...values);
  };
  assert.equal((await submitSurveyResponse(f.secret, { q1: 'ja' }, { sql, env, questionVersion: 1 })).saved, false);
  assert.equal((await getSurveyAccess(f.secret, { sql: db.sql, env })).status, 'not-found');
  assert.equal((await db.sql`SELECT id FROM survey_responses WHERE survey_id = ${f.surveyId}`).length, 0);
});

test('concurrent survey answers persist exactly one question snapshot', async () => {
  const f = await surveyFixture();
  const results = await Promise.all(Array.from({ length: 5 }, () => submitSurveyResponse(f.secret, { q1: 'ja' }, { sql: db.sql, env, questionVersion: 1 })));
  assert.equal(results.filter((result) => result.saved).length, 1);
  const rows = await db.sql`SELECT questions, answers, question_version FROM survey_responses WHERE survey_id = ${f.surveyId}`;
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { questions: [{ id: 'q1', text: 'Syntetisk spørsmål' }], answers: { q1: 'ja' }, question_version: 1 });
});

test('legacy sessions without a remaining primary email fail safely, including a change during submission', async () => {
  const f = await surveyFixture();
  const sql = async (strings, ...values) => {
    if (strings.join('').includes('INSERT INTO survey_responses')) await db.sql`UPDATE members SET primary_contact_email = NULL WHERE id = ${f.member.id}`;
    return await db.sql(strings, ...values);
  };
  assert.equal((await submitSurveyResponse(f.secret, { q1: 'ja' }, { sql, env, questionVersion: 1 })).saved, false);
  assert.equal((await getSurveyAccess(f.secret, { sql: db.sql, env })).status, 'not-found');
  assert.equal((await db.sql`SELECT id FROM survey_responses WHERE survey_id = ${f.surveyId}`).length, 0);
  assert.equal((await db.sql`SELECT id FROM survey_response_receipts WHERE survey_id = ${f.surveyId}`).length, 0);
});

test('changed question version between lookup and insert does not accept old answers', async () => {
  const f = await surveyFixture();
  const sql = async (strings, ...values) => {
    if (strings.join('').includes('INSERT INTO survey_responses')) await db.sql`UPDATE surveys SET question_version = 2, questions = '[{"id":"q1","text":"Endret spørsmål"}]' WHERE id = ${f.surveyId}`;
    return await db.sql(strings, ...values);
  };
  assert.equal((await submitSurveyResponse(f.secret, { q1: 'ja' }, { sql, env, questionVersion: 1 })).saved, false);
  assert.equal((await db.sql`SELECT id FROM survey_responses WHERE survey_id = ${f.surveyId}`).length, 0);
});
