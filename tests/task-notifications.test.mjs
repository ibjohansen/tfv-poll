import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { loadModule, plain } from './helpers/load-module.mjs';
import { assertDatabaseEnvironment } from '../lib/security-config.js';
import { renderTaskNotificationEmail } from '../lib/task-notification-email.js';
import { dispatchTaskNotifications } from '../lib/task-notifications-background.js';
import { MEMBER_PROPERTY_FIELDS } from '../lib/member-detail-sections.js';

// Synthetic, in-memory PostgreSQL only. No real mail, credentials or Neon access.
const db = new PGlite({ extensions: { pg_trgm } });
function sql(strings, ...values) {
  const text = strings.reduce((result, part, i) => result + (i ? `$${i}` : '') + part, '');
  return db.query(text, values).then((result) => result.rows);
}
const uuid = () => crypto.randomUUID().replaceAll('-', '');
const env = { NODE_ENV: 'test', APP_ENVIRONMENT: 'development', AUTH_URL: 'https://example.test' };
let api, members, memberId;
const deliveries = () => sql`SELECT * FROM email_deliveries WHERE email_type = 'admin_task_notification' ORDER BY created_at, id`;
async function request(status = 'pending_verification') {
  const id = uuid();
  await sql`INSERT INTO member_requests (id, request_type, status, h_number, street_address, requested_contact_name,
    requested_primary_email, verification_token_hash, requested_comment)
    VALUES (${id}, 'membership', ${status}, 'NEW-H', 'Syntetisk veg 1', 'Synthetic', 'member@example.test', ${'a'.repeat(64)}, 'Vennligst følg opp.')`;
  // The verification hash is unique; clear it after testing the snapshot.
  await sql`UPDATE member_requests SET verification_token_hash = NULL WHERE id = ${id}`;
  return id;
}
async function process(options = {}) {
  return api.processTaskNotifications({ sql, env, delayMs: 0, getSuppressions: async () => [], ...options });
}

before(async () => {
  const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../database/task-notifications.sql', import.meta.url), 'utf8');
  assert.equal(schema.slice(schema.indexOf('-- BEGIN: task-notifications'), schema.indexOf('-- END: task-notifications') + '-- END: task-notifications'.length).trim(), migration.trim());
  await db.exec(schema.slice(0, schema.indexOf('-- BEGIN: task-notifications')));
  await request();
  await db.exec(migration);
  await db.exec(migration);
  assert.equal((await deliveries()).length, 0, 'installing/reapplying the migration never backfills old tasks');
  await sql`INSERT INTO application_environment (environment) VALUES ('development')`;
  const [member] = await sql`INSERT INTO members (h_number, street_address, cadastral_number, section_number)
    VALUES ('TEST-H0101', 'Syntetisk veg 24', '10/24', '2') RETURNING id`;
  memberId = String(member.id);
  api = await loadModule('lib/task-notifications.js', {
    './db.js': { getSql: () => { throw new Error('Unexpected real database'); } },
    './security-config.js': { assertDatabaseEnvironment },
    './mailer-service.js': { isMailerSendConfigured: () => true,
      sendEmail: () => { throw new Error('Unexpected real mail'); }, getMailerSendSuppressions: () => [], isSuppressedRecipient: () => false },
    './task-notification-email.js': { renderTaskNotificationEmail },
  });
  members = await loadModule('lib/admin-member-updates.js', {
    './db.js': { getSql: () => sql }, './mock-store.js': { isMockMode: () => false },
    './admin-access.js': { requirePermission: async () => ({ email: 'admin@example.test' }) },
    './map/member-hamlet-assignment.js': { findHamletForNewMember: () => { throw new Error('Unexpected lookup'); } },
  });
});
beforeEach(async () => {
  await sql`DELETE FROM email_deliveries WHERE email_type = 'admin_task_notification'`;
  await sql`DELETE FROM email_suppressions`;
});
after(async () => db.close());

test('H-number edits persist, preserve cadastral fields and legacy clients, and reject blanks and duplicates', async () => {
  const input = { h_number: '  TEST-H101  ', other_contact_emails: [], cadastral_number: '999/999', section_number: '999' };
  const saved = await members.updateAdminMember(memberId, input);
  assert.equal(saved.h_number, 'TEST-H101'); assert.equal(saved.cadastral_number, '10/24'); assert.equal(saved.section_number, '2');
  const legacy = await members.updateAdminMember(memberId, { other_contact_emails: [] });
  assert.equal(legacy.h_number, 'TEST-H101');
  await assert.rejects(members.updateAdminMember(memberId, { ...input, h_number: ' ' }), /H-nummer is required/);
  await sql`INSERT INTO members (h_number) VALUES ('DUPLICATE-H')`;
  await assert.rejects(members.updateAdminMember(memberId, { ...input, h_number: 'DUPLICATE-H' }), (error) => error.code === '23505');
  const [audit] = await sql`SELECT before_value, after_value FROM audit_log
    WHERE table_name = 'members' AND row_id = ${memberId} AND before_value->>'h_number' = 'TEST-H0101' ORDER BY id DESC LIMIT 1`;
  assert.equal(audit.after_value.h_number, 'TEST-H101');
  assert.deepEqual(MEMBER_PROPERTY_FIELDS.find(([name]) => name === 'h_number'), ['h_number']);
  assert.equal(MEMBER_PROPERTY_FIELDS.find(([name]) => name === 'cadastral_number')[1], true);
});

test('membership verification/resolution produces one snapshot without email addresses or secrets', async () => {
  const id = await request();
  const [queued] = await deliveries();
  assert.equal(queued.recipient_email, 'post@turufjellvel.no');
  assert.equal(queued.task_snapshot.kind, 'membership');
  assert.equal(queued.task_snapshot.comment, 'Vennligst følg opp.');
  assert.doesNotMatch(JSON.stringify(queued.task_snapshot), /token|member@example|requested_contact_name/);
  await sql`UPDATE member_requests SET status = 'pending' WHERE id = ${id}`;
  await sql`UPDATE member_requests SET status = 'approved' WHERE id = ${id}`;
  assert.equal((await deliveries()).length, 1);
  const sends = [];
  const result = await process({ sendEmail: async (message) => { sends.push(message); return { messageId: 'test-provider-id' }; } });
  assert.deepEqual(plain(result), { sent: 1, pending: false });
  assert.equal(sends[0].to, 'post@turufjellvel.no'); assert.match(sends[0].text, /NEW-H/);
  assert.match(sends[0].text, /https:\/\/example.test\/admin\/inbox/);
  assert.equal((await deliveries())[0].provider_message_id, 'test-provider-id');
  await process({ sendEmail: () => assert.fail('duplicate send') });
});

test('ownership transfer and unread comments/map imports notify; contact-only updates do not', async () => {
  await sql`INSERT INTO member_requests (id, request_type, status, member_id, requested_contact_name, requested_primary_email)
    VALUES (${uuid()}, 'ownership_transfer', 'pending', ${memberId}, 'Synthetic', 'new@example.test')`;
  await sql`INSERT INTO member_profile_updates (id, member_id, changed_fields) VALUES (${uuid()}, ${memberId}, ARRAY['primary_contact_name'])`;
  const commentId = uuid();
  await sql`INSERT INTO member_profile_updates (id, member_id, changed_fields, comment)
    VALUES (${commentId}, ${memberId}, ARRAY['primary_contact_name'], 'En kommentar')`;
  await sql`UPDATE member_profile_updates SET comment_read_at = NOW() WHERE id = ${commentId}`;
  await sql`INSERT INTO member_profile_updates (id, member_id, changed_fields, comment)
    VALUES (${uuid()}, ${memberId}, ARRAY['h_number'], 'MAP_IMPORT_TASK: Fyll inn H-nummer')`;
  assert.deepEqual((await deliveries()).map((row) => row.task_snapshot.kind).sort(), ['map_import', 'ownership_transfer', 'profile_update']);
});

test('rolling back a task also rolls back its notification', async () => {
  await assert.rejects(db.transaction(async (transaction) => {
    await transaction.query(`INSERT INTO member_profile_updates (id, member_id, changed_fields, comment)
      VALUES ($1, $2, '{}', 'Rollback test')`, [uuid(), memberId]);
    throw new Error('Abort synthetic transaction');
  }), /Abort synthetic transaction/);
  assert.equal((await deliveries()).length, 0);
});

test('monthly controls notify only when they produce an inbox task and never on follow-up updates', async () => {
  const clean = uuid(), changed = uuid(), failed = uuid();
  await sql`INSERT INTO matrikkel_sync_runs (id, status, requested_by, run_type, scheduled_month)
    VALUES (${clean}, 'completed', 'system', 'monthly', '2026-01-01')`;
  await sql`INSERT INTO matrikkel_sync_runs (id, status, requested_by, run_type, scheduled_month)
    VALUES (${changed}, 'running', 'system', 'monthly', '2026-02-01')`;
  await sql`UPDATE matrikkel_sync_runs SET status = 'completed', review_count = 2, total_count = 10 WHERE id = ${changed}`;
  await sql`UPDATE matrikkel_sync_runs SET followup_completed_at = NOW() WHERE id = ${changed}`;
  await sql`INSERT INTO matrikkel_sync_runs (id, status, requested_by, run_type, scheduled_month)
    VALUES (${failed}, 'failed', 'system', 'monthly', '2026-03-01')`;
  await sql`INSERT INTO matrikkel_sync_runs (id, status, requested_by, review_count) VALUES (${uuid()}, 'completed', 'system', 3)`;
  const activity = async (summary, month, status = 'preview') => sql`INSERT INTO activity_map_source_runs
    (id, status, run_type, scheduled_month, source_ids, center, radius_km, fetched_at, raw_sha256, plan_sha256, summary, created_by)
    VALUES (${uuid()}, ${status}, 'monthly', ${month}, '[]', '[9,60]', 20, NOW(), ${'a'.repeat(64)}, ${'b'.repeat(64)}, ${JSON.stringify(summary)}, 'system')`;
  await activity({}, '2026-01-01'); await activity({ changed: 1, missing: 2 }, '2026-02-01'); await activity({}, '2026-03-01', 'failed');
  const rows = await deliveries(); assert.equal(rows.length, 4);
  assert.equal(rows.filter((row) => row.task_snapshot.kind === 'matrikkel').length, 2);
  assert.equal(rows.filter((row) => row.task_snapshot.kind === 'activity_map').length, 2);
});

test('provider rate limits defer a bounded retry; uncertain failures and interruptions never resend', async () => {
  await request();
  await process({ sendEmail: async () => { throw Object.assign(new Error('limited'), { code: 'MAILERSEND_RATE_LIMIT', providerStatus: 429 }); } });
  let [row] = await deliveries(); assert.equal(row.status, 'pending'); assert.ok(row.task_retry_at);
  await process({ sendEmail: () => assert.fail('retry before deadline') });
  await sql`UPDATE email_deliveries SET task_retry_at = NOW() - INTERVAL '1 minute', task_attempt_count = 4 WHERE id = ${row.id}`;
  await process({ sendEmail: async () => { throw Object.assign(new Error('limited'), { code: 'MAILERSEND_RATE_LIMIT', providerStatus: 429 }); } });
  [row] = await deliveries(); assert.equal(row.status, 'failed'); assert.equal(row.task_attempt_count, 5);
  await request();
  await process({ sendEmail: async () => { throw Object.assign(new Error('timeout'), { code: 'NETWORK' }); } });
  await request();
  await sql`UPDATE email_deliveries SET status = 'processing', processing_at = NOW() - INTERVAL '17 minutes' WHERE status = 'pending'`;
  await process({ sendEmail: () => assert.fail('uncertain request must not resend') });
  const rows = await deliveries(); assert.ok(rows.every((item) => item.status === 'failed'));
  assert.ok(rows.some((item) => item.failure_reason === 'UNCERTAIN_AFTER_INTERRUPTION'));
});

test('removed requests and suppressed recipients do not send, and the database environment is enforced', async () => {
  const id = await request();
  await sql`DELETE FROM member_requests WHERE id = ${id}`;
  await process({ sendEmail: () => assert.fail('deleted task') });
  assert.equal((await deliveries())[0].failure_reason, 'TASK_REMOVED_BEFORE_SEND');
  await request();
  await sql`INSERT INTO email_suppressions (recipient_email, reason) VALUES ('post@turufjellvel.no', 'hard_bounce')`;
  await process({ sendEmail: () => assert.fail('suppressed recipient') });
  assert.equal((await deliveries()).filter((row) => row.status === 'suppressed').length, 1);
  await assert.rejects(process({ env: { ...env, APP_ENVIRONMENT: 'staging', TOKEN_AUDIENCE: 'tfv-test', SECURITY_EVENT_HMAC_KEY: 'k'.repeat(32) } }), /Database environment mismatch/);
});

test('summaries escape HTML, label fields, distinguish unverified membership and explain failed checks', () => {
  const rendered = renderTaskNotificationEmail({ kind: 'profile_update', source_id: '123', comment: '<script>alert(1)</script>',
    changed_fields: ['primary_contact_name'], h_number: 'H101' }, 'https://example.test');
  assert.match(rendered.html, /&lt;script&gt;/); assert.doesNotMatch(rendered.html, /<script>/);
  assert.match(rendered.text, /Kontaktperson/);
  assert.match(renderTaskNotificationEmail({ kind: 'membership', status: 'pending_verification' }, 'https://example.test').text, /ikke bekreftet/);
  assert.match(renderTaskNotificationEmail({ kind: 'matrikkel', status: 'failed' }, 'https://example.test').text, /Kontrollen feilet/);
});

test('dispatch pins credentials to the configured origin and rejects redirects', async () => {
  const jobEnv = { APP_ENVIRONMENT: 'production', AUTH_URL: 'https://example.test', MAILERSEND_JOB_SECRET: 's'.repeat(32) };
  await dispatchTaskNotifications('https://untrusted.test', { env: jobEnv, fetchImpl: async (url, init) => {
    assert.equal(url.origin, 'https://example.test'); assert.equal(init.redirect, 'manual'); return new Response(null, { status: 202 });
  } });
  await assert.rejects(dispatchTaskNotifications('https://example.test', { env: jobEnv,
    fetchImpl: async () => new Response(null, { status: 302 }) }), /JOB_DISPATCH_REJECTED/);
});

test('production watchdog dispatches due tasks without interrupting other background work', async () => {
  let dispatches = 0, recovered = 0;
  const watchdog = await loadModule('netlify/functions/background-watchdog.mjs', {
    '../../lib/db.js': { getSql: () => sql },
    '../../lib/task-notifications-background.js': { dispatchTaskNotifications: async () => { dispatches++; } },
    '../../lib/annual-dues-background.js': { dispatchAnnualDues: async () => assert.fail('invoice sending disabled') },
    '../../lib/survey-email-background.js': { dispatchSurveyReceipts: () => assert.fail('no receipts') },
    '../../lib/activity-map-import-background.js': { startDueMonthlyActivityImport: async () => ({ result: 'idle' }) },
    '../../lib/background-watchdog.js': { recoverDueSurveyEmailCampaigns: async () => ({ result: 'idle' }),
      recoverStalledMatrikkelRuns: async () => { recovered++; return { result: 'idle' }; },
      startDueMonthlyMatrikkelRun: async () => ({ result: 'idle' }) },
  }, { process: { env: { APP_ENVIRONMENT: 'production' } } });
  await request();
  await watchdog.default({}, { deploy: { context: 'deploy-preview' } }); assert.equal(dispatches, 0);
  await watchdog.default({}, { deploy: { context: 'production' } }); assert.equal(dispatches, 1); assert.equal(recovered, 1);
  await sql`UPDATE email_deliveries SET task_retry_at = NOW() + INTERVAL '1 day' WHERE email_type = 'admin_task_notification'`;
  await watchdog.default({}, { deploy: { context: 'production' } }); assert.equal(dispatches, 1); assert.equal(recovered, 2);
});

test('background handler requires both the job secret and production platform context', async () => {
  let runs = 0;
  const handler = await loadModule('netlify/functions/task-notifications-background.mjs', {
    'node:crypto': crypto, '../../lib/task-notifications.js': { processTaskNotifications: async () => { runs++; return { sent: 1 }; } },
  }, { process: { env: { APP_ENVIRONMENT: 'production', MAILERSEND_JOB_SECRET: 's'.repeat(32) } } });
  const invoke = (secret, method = 'POST', context = 'production') => handler.default(new Request('https://example.test/job',
    { method, headers: { 'x-mailersend-job-secret': secret } }), { deploy: { context } });
  assert.equal((await invoke('invalid')).status, 403);
  assert.equal((await invoke('s'.repeat(32), 'POST', 'deploy-preview')).status, 403);
  assert.equal((await invoke('s'.repeat(32), 'GET')).status, 405);
  assert.equal((await invoke('s'.repeat(32))).status, 204); assert.equal(runs, 1);
});
