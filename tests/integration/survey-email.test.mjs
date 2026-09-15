import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '../helpers/postgres.mjs';
import { loadModule } from '../helpers/load-module.mjs';
import * as memberUtils from '../../lib/member-self-service-utils.js';
import * as emailUtils from '../../lib/survey-email-utils.js';
import * as securityConfig from '../../lib/security-config.js';
import * as securityEvents from '../../lib/security-events.js';
import { normalizeEmail, MailerServiceError } from '../../lib/mailer-service.js';
import { memberTestEnvironment as env } from '../helpers/member-service.mjs';

const db = createTestDatabase();
before(async () => db.migrate());
after(async () => db.close());
async function service(sendEmail, suppressionCheck = async () => []) {
  return loadModule('lib/survey-email.js', {
    'node:crypto': crypto, './db.js': { getSql: () => db.sql }, './mock-store.js': { isMockMode: () => false },
    './admin-access.js': { requirePermission: async () => ({ email: 'admin@example.test' }) },
    './member-self-service-utils.js': memberUtils, './survey-email-utils.js': emailUtils,
    './security-config.js': securityConfig, './security-events.js': securityEvents,
    './email-templates.js': { renderSurveyInvitationEmail: () => ({ subject: 'Synthetic', text: 'No actual send', html: '' }) },
    './mailer-service.js': { getMailerSendConfig: () => ({}), getMailerSendSuppressions: suppressionCheck,
      isMailerSendBulkEnabled: () => true, isMailerSendConfigured: () => true, isSuppressedRecipient: () => false,
      MailerServiceError, normalizeEmail, requireMailerSendBulkEnabled: () => {}, sendEmail },
  }, { process: { env } });
}
async function fixture() {
  const surveyId = randomUUID().replaceAll('-', '');
  const campaignId = randomUUID().replaceAll('-', '');
  await db.sql`INSERT INTO surveys (id, title, is_open, ends_on) VALUES (${surveyId}, 'Synthetic', TRUE, '2099-12-31')`;
  await db.sql`INSERT INTO email_campaigns (id, survey_id, requested_by, total_count) VALUES (${campaignId}, ${surveyId}, 'admin@example.test', 3)`;
  const rows = [];
  for (let i = 0; i < 3; i++) {
    const email = `${randomUUID()}@example.test`;
    const [member] = await db.sql`INSERT INTO members (h_number, primary_contact_email) VALUES (${`email-${randomUUID()}`}, ${email}) RETURNING id`;
    const id = randomUUID().replaceAll('-', '');
    await db.sql`INSERT INTO email_deliveries (id, campaign_id, member_id, survey_id, recipient_email, email_type, subject)
      VALUES (${id}, ${campaignId}, ${member.id}, ${surveyId}, ${email}, 'survey_invitation', 'Synthetic')`;
    rows.push({ id, email, memberId: member.id });
  }
  return { surveyId, campaignId, rows };
}
test('email workers exclude duplicate invocations, retain partial failure and never resend completed deliveries', async () => {
  const f = await fixture();
  let started, release;
  const sending = new Promise((resolve) => { started = resolve; });
  const hold = new Promise((resolve) => { release = resolve; });
  const sent = [];
  const api = await service(async (email) => {
    sent.push(email.to); started(); await hold;
    if (email.to === f.rows[1].email) throw new MailerServiceError('Synthetic rejection', 'TEST_FAILURE', 503);
    return { messageId: randomUUID() };
  });
  const first = api.processSurveyEmailCampaign(f.campaignId, { delayMs: 0 });
  await sending;
  const second = await api.processSurveyEmailCampaign(f.campaignId, { delayMs: 0 });
  assert.equal(second.workerBusy, true);
  release();
  const result = await first;
  assert.equal(result.status, 'completed'); assert.equal(result.sent_count, 2); assert.equal(result.failed_count, 1);
  await api.processSurveyEmailCampaign(f.campaignId, { delayMs: 0 });
  assert.equal(sent.length, 3); assert.equal(new Set(sent).size, 3);
  const activity = await db.sql`SELECT * FROM admin_activity_log WHERE table_name = 'email_campaigns' AND row_id = ${f.campaignId}`;
  assert.equal(activity.length, 3); assert.equal(new Set(activity.map((event) => event.id)).size, 3);
  assert.equal(JSON.stringify(activity.map((event) => event.after_value)).includes('@example.test'), false);
});
test('expired processing is uncertain and not resent; source changes and suppression failure fail safely', async () => {
  const f = await fixture();
  await db.sql`UPDATE email_deliveries SET status = 'processing', processing_at = NOW() - INTERVAL '17 minutes' WHERE id = ${f.rows[0].id}`;
  await db.sql`UPDATE members SET membership_status = 'exempt' WHERE id = ${f.rows[1].memberId}`;
  let attempts = 0;
  const api = await service(async () => { attempts++; return { messageId: randomUUID() }; });
  await api.processSurveyEmailCampaign(f.campaignId, { delayMs: 0 });
  assert.equal(attempts, 1);
  assert.equal((await db.sql`SELECT failure_reason FROM email_deliveries WHERE id = ${f.rows[0].id}`)[0].failure_reason, 'UNCERTAIN_AFTER_INTERRUPTION');
  assert.equal((await db.sql`SELECT failure_reason FROM email_deliveries WHERE id = ${f.rows[1].id}`)[0].failure_reason, 'SOURCE_DATA_CHANGED');
  const other = await fixture();
  const failed = await service(async () => assert.fail('Unexpected send'), async () => { throw new Error('Synthetic suppression failure'); });
  await assert.rejects(failed.processSurveyEmailCampaign(other.campaignId), /Synthetic suppression failure/);
  assert.equal((await db.sql`SELECT status FROM email_campaigns WHERE id = ${other.campaignId}`)[0].status, 'failed');
});
test('deadline yields before claiming a new email; testmail activity retains actor without content', async () => {
  const f = await fixture();
  const api = await service(async () => ({ messageId: randomUUID() }));
  const result = await api.processSurveyEmailCampaign(f.campaignId, { delayMs: 0, deadline: Date.now() + 1000 });
  assert.equal(result.status, 'running');
  assert.equal((await db.sql`SELECT id FROM email_deliveries WHERE campaign_id = ${f.campaignId} AND status = 'pending'`).length, 3);
  await api.sendSurveyTestEmail(f.surveyId, 'synthetic-test@example.test');
  const events = await db.sql`SELECT * FROM admin_activity_log WHERE table_name = 'email_deliveries' AND after_value->>'survey_id' = ${f.surveyId}`;
  assert.equal(events.length, 2); assert.ok(events.every((event) => event.changed_by === 'admin@example.test'));
  assert.equal(JSON.stringify(events).includes('synthetic-test@example.test'), false);
});
