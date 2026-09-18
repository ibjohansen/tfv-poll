import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '../helpers/postgres.mjs';
import { loadMemberService, memberTestEnvironment as env } from '../helpers/member-service.mjs';
import { createAccessSecret, hashAccessSecret } from '../../lib/member-self-service-utils.js';

const db = createTestDatabase();
let api;
before(async () => { await db.migrate(); api = await loadMemberService(db.sql); });
after(async () => { await db.close(); });

async function fixture() {
  const [member] = await db.sql`INSERT INTO members (h_number, primary_contact_name, primary_contact_email)
    VALUES (${`test-${randomUUID()}`}, 'Syntetisk kontakt', 'member@example.test') RETURNING id`;
  const secret = createAccessSecret();
  await db.sql`INSERT INTO member_access_tokens (id, member_id, token_hash, environment, audience, expires_at)
    VALUES (${randomUUID().replaceAll('-', '')}, ${member.id}, ${hashAccessSecret(secret)}, 'development', ${env.TOKEN_AUDIENCE}, NOW() + INTERVAL '15 minutes')`;
  return { memberId: String(member.id), secret };
}

test('a real one-time link creates exactly one session under concurrent use', async () => {
  const f = await fixture();
  const results = await Promise.all(Array.from({ length: 8 }, () => api.verifyMemberAccess(f.secret)));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal((await db.sql`SELECT id FROM member_sessions WHERE member_id = ${f.memberId}`).length, 1);
  const events = await db.sql`SELECT * FROM security_events WHERE member_id = ${f.memberId}`;
  assert.ok(events.length);
  assert.equal(JSON.stringify(events).includes(f.secret), false);
});

test('member comment stays with its update, appears in inbox and can be acknowledged without deletion', async () => {
  const f = await fixture();
  const session = await api.verifyMemberAccess(f.secret);
  const comment = '<img src=x onerror=alert(1)>\nDette er ren tekst.';
  await api.updateMemberSelfServiceProfile(session.secret, {
    primary_contact_name: 'Syntetisk rettet kontakt', primary_contact_email: 'member@example.test', other_contact_emails: [], comment,
  });
  const [update] = await db.sql`SELECT * FROM member_profile_updates WHERE member_id = ${f.memberId}`;
  assert.equal(update.comment, comment);
  assert.equal((await api.getMemberSelfServiceProfile(session.secret)).updates[0].comment, comment);
  const request = (await api.getAdminMemberRequests()).find((item) => item.id === update.id);
  assert.equal(request.request_type, 'profile_update');
  assert.equal(request.requested_comment, comment);
  const taskCount = await api.getAdminTaskCount();
  assert.ok(taskCount >= 1);
  await api.resolveAdminMemberRequest(update.id, 'acknowledge_comment');
  assert.equal((await api.getAdminMemberRequests()).some((item) => item.id === update.id), false);
  assert.equal(await api.getAdminTaskCount(), taskCount - 1);
  const audit = await db.sql`SELECT changed_by, after_value FROM audit_log WHERE table_name = 'member_profile_updates' AND row_id = ${update.id} ORDER BY id`;
  assert.deepEqual(audit.map((row) => row.changed_by), [`member:${f.memberId}`, 'admin@example.test']);
  assert.ok(audit[1].after_value.comment_read_at);
  assert.equal(audit[1].after_value.comment, comment);
});

test('monthly Matrikkel deviations appear in the task list count until the run is hidden', async () => {
  const before = await api.getAdminTaskCount();
  const runId = randomUUID().replaceAll('-', '');
  await db.sql`INSERT INTO matrikkel_sync_runs
    (id, requested_by, status, run_type, scheduled_month, total_count, processed_count, unchanged_count, review_count)
    VALUES (${runId}, 'system:monthly-matrikkel', 'completed', 'monthly', '2098-07-01', 10, 10, 8, 2)`;
  const tasks = await api.getAdminMatrikkelTasks();
  assert.equal(tasks.find((task) => task.id === runId).review_count, 2);
  assert.equal(await api.getAdminTaskCount(), before + 1);
  await db.sql`UPDATE matrikkel_sync_runs SET deleted_at = NOW() WHERE id = ${runId}`;
  assert.equal(await api.getAdminTaskCount(), before);
});

test('member can change sharing reservation and the timestamp and profile history are retained', async () => {
  const f = await fixture();
  const session = await api.verifyMemberAccess(f.secret);
  const updated = await api.updateMemberSelfServiceProfile(session.secret, {
    primary_contact_name: 'Syntetisk kontakt', primary_contact_email: 'member@example.test',
    other_contact_emails: [], turufjell_as_sharing_opt_out: true,
  });
  assert.equal(updated.turufjell_as_sharing_opt_out, true);
  assert.ok(updated.turufjell_as_sharing_opt_out_updated_at);
  const profile = await api.getMemberSelfServiceProfile(session.secret);
  assert.equal(profile.member.turufjell_as_sharing_opt_out, true);
  assert.deepEqual(profile.updates[0].changed_fields, ['turufjell_as_sharing_opt_out']);
  const [audit] = await db.sql`SELECT changed_by, after_value FROM audit_log WHERE table_name = 'members' AND row_id = ${f.memberId} AND operation = 'UPDATE' ORDER BY id DESC LIMIT 1`;
  assert.equal(audit.changed_by, `member:${f.memberId}`);
  assert.equal(audit.after_value.turufjell_as_sharing_opt_out, true);
});

test('expired sessions and invalid comments never mutate member data', async () => {
  const f = await fixture();
  const session = await api.verifyMemberAccess(f.secret);
  const input = { primary_contact_name: 'Unwanted', primary_contact_email: 'member@example.test', other_contact_emails: [], comment: 'x'.repeat(2001) };
  await assert.rejects(api.updateMemberSelfServiceProfile(session.secret, input), /Invalid member data/);
  await db.sql`UPDATE member_sessions SET revoked_at = NOW() WHERE member_id = ${f.memberId}`;
  await assert.rejects(api.updateMemberSelfServiceProfile(session.secret, { ...input, comment: 'Test' }), /Invalid member session/);
  assert.equal((await db.sql`SELECT primary_contact_name FROM members WHERE id = ${f.memberId}`)[0].primary_contact_name, 'Syntetisk kontakt');
  assert.equal((await db.sql`SELECT id FROM member_profile_updates WHERE member_id = ${f.memberId}`).length, 0);
});
