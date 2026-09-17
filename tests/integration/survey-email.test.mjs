import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '../helpers/postgres.mjs';
import { loadModule, plain } from '../helpers/load-module.mjs';
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
    './survey-email-background.js': { getSurveyEmailBackgroundStatus: () => 'ready' },
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

test('additional emails are opt-in; adding overlapping groups and individual properties does not resend', async () => {
  const surveyId = randomUUID().replaceAll('-', '');
  await db.sql`INSERT INTO surveys (id, title, ends_on) VALUES (${surveyId}, 'Synthetic additions', '2099-12-31')`;
  const [group] = await db.sql`INSERT INTO member_email_groups (name) VALUES (${randomUUID()}) RETURNING id`;
  const [member] = await db.sql`INSERT INTO members (h_number, primary_contact_email, other_contact_emails)
    VALUES (${randomUUID()}, 'primary@example.test', ARRAY['other@example.test', 'PRIMARY@example.test']) RETURNING id`;
  await db.sql`INSERT INTO member_email_group_members (group_id, member_id) VALUES (${group.id}, ${member.id})`;
  const api = await service(async () => ({ messageId: randomUUID() }));
  const created = await api.createSurveyEmailCampaign(surveyId, { groupId: String(group.id) });
  assert.equal(created.campaign.total_count, 1);
  assert.equal(created.added_count, 1);
  const appended = await api.createSurveyEmailCampaign(surveyId, { groupId: String(group.id), memberIds: [String(member.id)], includeOtherEmails: true, appendRecipients: true });
  assert.equal(appended.campaign.id, created.campaign.id); assert.equal(appended.campaign.total_count, 2);
  assert.equal(appended.added_count, 1);
  const repeated = await api.createSurveyEmailCampaign(surveyId, { memberIds: [String(member.id)], includeOtherEmails: true, appendRecipients: true });
  assert.equal(repeated.campaign.total_count, 2);
  assert.equal(repeated.added_count, 0);
  await assert.rejects(api.createSurveyEmailCampaign(surveyId, { memberIds: [String(member.id)], appendRecipients: true, singleResponsePerProperty: false }));
  const sent = await api.processSurveyEmailCampaign(created.campaign.id, { delayMs: 0 });
  assert.equal(sent.sent_count, 2);
  const tokens = await db.sql`SELECT recipient_email FROM survey_access_tokens WHERE survey_id = ${surveyId} AND revoked_at IS NULL`;
  assert.equal(tokens.length, 2);
});
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

test('survey mailing previews and locks recipients to the selected email group', async () => {
  const surveyId = randomUUID().replaceAll('-', '');
  await db.sql`INSERT INTO surveys (id, title, is_open, ends_on) VALUES (${surveyId}, 'Grouped survey', TRUE, '2099-12-31')`;
  const [group] = await db.sql`INSERT INTO member_email_groups (name) VALUES (${`Survey group ${randomUUID()}`}) RETURNING id`;
  const members = [];
  for (const values of [
    ['Kari Kontakt', 'Kari Hjemmelshaver', 'kari@example.test'],
    ['Ola Kontakt', 'Ola Hjemmelshaver', 'ola@example.test'],
    ['Uten e-post', 'Uten Epostsen', null],
  ]) {
    const [member] = await db.sql`INSERT INTO members (h_number, primary_contact_name, title_holder, primary_contact_email)
      VALUES (${`group-${randomUUID()}`}, ${values[0]}, ${values[1]}, ${values[2]}) RETURNING id`;
    members.push(member);
    await db.sql`INSERT INTO member_email_group_members (group_id, member_id) VALUES (${group.id}, ${member.id})`;
  }
  const sent = [];
  const api = await service(async ({ to }) => { sent.push(to); return { messageId: randomUUID() }; });
  const overview = await api.getSurveyEmailOverview(surveyId, 1, String(group.id));
  assert.equal(overview.selected_group_id, String(group.id));
  assert.equal(overview.recipient_count, 2);
  assert.equal(overview.missing_email_count, 1);
  assert.deepEqual(plain(overview.recipients).map(({ name, title_holder, primary_contact_email }) => (
    { name, title_holder, primary_contact_email }
  )), [
    { name: 'Kari Kontakt', title_holder: 'Kari Hjemmelshaver', primary_contact_email: 'kari@example.test' },
    { name: 'Ola Kontakt', title_holder: 'Ola Hjemmelshaver', primary_contact_email: 'ola@example.test' },
  ]);
  const created = await api.createSurveyEmailCampaign(surveyId, { groupId: String(group.id) });
  assert.equal(created.campaign.group_id, String(group.id));
  assert.equal(created.campaign.total_count, 2);
  assert.equal((await db.sql`SELECT id FROM email_deliveries WHERE campaign_id = ${created.campaign.id}`).length, 2);

  await db.sql`DELETE FROM member_email_group_members WHERE group_id = ${group.id} AND member_id = ${members[1].id}`;
  const completed = await api.processSurveyEmailCampaign(created.campaign.id, { delayMs: 0 });
  assert.equal(completed.status, 'completed');
  assert.deepEqual(sent, ['kari@example.test']);
  const [removed] = await db.sql`SELECT failure_reason FROM email_deliveries WHERE campaign_id = ${created.campaign.id} AND member_id = ${members[1].id}`;
  assert.equal(removed.failure_reason, 'SOURCE_DATA_CHANGED');
});
