import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '../helpers/postgres.mjs';
import { loadModule } from '../helpers/load-module.mjs';
import * as utils from '../../lib/newsletter-utils.js';
import { textToRichText } from '../../lib/rich-text.js';
import { normalizeEmail } from '../../lib/mailer-service.js';

const db = createTestDatabase();
before(async () => db.migrate());
after(async () => db.close());
async function service(sendEmail = async () => assert.fail('Unexpected send')) {
  return loadModule('lib/newsletters.js', {
    'node:crypto': crypto, './db.js': { getSql: () => db.sql }, './mock-store.js': { isMockMode: () => false },
    './admin-access.js': { requirePermission: async () => ({ email: 'admin@example.test' }) },
    './newsletter-utils.js': utils, './survey-email.js': { getApplicationBaseUrl: () => 'https://example.test' },
    './mailer-service.js': { getMailerSendConfig: () => ({}), requireMailerSendBulkEnabled: () => {}, isMailerSendBulkEnabled: () => true,
      getMailerSendSuppressions: async () => [], isSuppressedRecipient: () => false, normalizeEmail, sendEmail },
  });
}
async function fixture(api) {
  const key = randomUUID();
  const rows = await db.sql`INSERT INTO members (h_number, primary_contact_email, other_contact_emails, membership_status)
    VALUES (${`news1-${key}`}, ${`${key}@example.test`}, ARRAY[${`other-${key}@example.test`}], 'member'),
      (${`news2-${key}`}, ${`${key.toUpperCase()}@EXAMPLE.TEST`}, ARRAY[]::text[], 'member'),
      (${`news3-${key}`}, ${`exempt-${key}@example.test`}, ARRAY[]::text[], 'exempt') RETURNING id`;
  const groups = await db.sql`INSERT INTO member_email_groups (name) VALUES (${`Newsletter A ${key}`}), (${`Newsletter B ${key}`}) RETURNING id`;
  for (const group of groups) await db.sql`INSERT INTO member_email_group_members (group_id, member_id) SELECT ${group.id}, unnest(${rows.map((row) => row.id)}::bigint[])`;
  const input = { subject: 'Syntetisk nyhetsbrev', body: textToRichText('Dette sendes aldri ut av testmiljøet.'), groupIds: groups.map((group) => String(group.id)) };
  const campaign = await api.saveNewsletter(input);
  return { campaign, input, rows, groups, key };
}
test('newsletter preview deduplicates shared and overlapping recipients, queue freezes content atomically', async () => {
  const api = await service();
  const f = await fixture(api);
  assert.equal((await api.previewNewsletter(f.campaign.id)).recipientCount, 2);
  const queued = await Promise.all([api.queueNewsletter(f.campaign.id), api.queueNewsletter(f.campaign.id)]);
  assert.ok(queued.every((campaign) => campaign.total_count === 2));
  assert.equal((await db.sql`SELECT id FROM email_deliveries WHERE newsletter_id = ${f.campaign.id}`).length, 2);
  await assert.rejects(api.saveNewsletter({ ...f.input, id: f.campaign.id, subject: 'Too late' }), /Invalid newsletter/);
  const state = await api.getNewsletters(f.campaign.id);
  assert.equal(Object.hasOwn(state.campaign, 'worker_token'), false);
});
test('newsletter worker excludes simultaneous invocation, isolates failures and never resends processed recipients', async () => {
  let started, release;
  const sending = new Promise((resolve) => { started = resolve; });
  const hold = new Promise((resolve) => { release = resolve; });
  const sent = [];
  const api = await service(async (email) => {
    sent.push(email); started(); await hold;
    if (email.to.startsWith('other-')) throw new Error('Synthetic failure');
    return { messageId: randomUUID() };
  });
  const f = await fixture(api); await api.queueNewsletter(f.campaign.id);
  const running = api.processNewsletter(f.campaign.id, { delayMs: 0 });
  await sending;
  assert.equal((await api.processNewsletter(f.campaign.id, { delayMs: 0 })).workerBusy, true);
  release();
  assert.equal((await running).status, 'completed');
  const { campaign } = await api.getNewsletters(f.campaign.id);
  assert.equal(campaign.sent_count, 1); assert.equal(campaign.failed_count, 1);
  await api.processNewsletter(f.campaign.id, { delayMs: 0 });
  assert.equal(sent.length, 2);
  const events = await db.sql`SELECT after_value FROM admin_activity_log WHERE after_value->>'newsletter_id' = ${f.campaign.id}`;
  assert.equal(JSON.stringify(events).includes('@example.test'), false);
});
test('newsletter revalidates group membership and keeps interrupted sends uncertain', async () => {
  const api = await service();
  const f = await fixture(api); await api.queueNewsletter(f.campaign.id);
  await db.sql`UPDATE email_deliveries SET status = 'processing', processing_at = NOW() - INTERVAL '17 minutes'
    WHERE newsletter_id = ${f.campaign.id} AND recipient_email LIKE 'other-%'`;
  await db.sql`DELETE FROM member_email_group_members WHERE group_id = ANY(${f.input.groupIds}::bigint[])`;
  await api.processNewsletter(f.campaign.id, { delayMs: 0 });
  const { campaign, deliveries } = await api.getNewsletters(f.campaign.id);
  assert.equal(campaign.failed_count, 1); assert.equal(campaign.suppressed_count, 1);
  assert.ok(deliveries.some((delivery) => delivery.failure_reason === 'UNCERTAIN_AFTER_INTERRUPTION'));
});
