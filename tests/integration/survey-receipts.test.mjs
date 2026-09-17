import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '../helpers/postgres.mjs';
import { loadModule } from '../helpers/load-module.mjs';
import { memberTestEnvironment as env } from '../helpers/member-service.mjs';
import { assertDatabaseEnvironment } from '../../lib/security-config.js';
import { normalizeEmail } from '../../lib/mailer-service.js';
import { renderSurveyReceiptEmail } from '../../lib/email-templates.js';

const db = createTestDatabase();
const id = () => randomUUID().replaceAll('-', '');
async function worker(sendEmail) {
  const api = await loadModule('lib/survey-receipts.js', {
    './db.js': { getSql: () => db.sql }, 'node:crypto': { randomUUID },
    './security-config.js': { assertDatabaseEnvironment },
    './mailer-service.js': { isMailerSendConfigured: () => true, normalizeEmail,
      isSuppressedRecipient: () => false, getMailerSendSuppressions: async () => [], sendEmail },
    './email-templates.js': { renderSurveyReceiptEmail },
    './survey-email.js': { getApplicationBaseUrl: () => 'https://example.test' },
  });
  return () => api.processSurveyReceipts({ sql: db.sql, env, delayMs: 0, batchSize: 1000 });
}
before(async () => {
  await db.migrate();
  // Settle synthetic pending receipts from previous suites/runs through the
  // real worker with a fake transport. No real provider can be reached.
  await (await worker(async () => ({ messageId: id() })))();
});
after(async () => db.close());
async function fixture() {
  const surveyId = id(), primary = `${id()}@example.test`, secondary = `${id()}@example.test`;
  const [member] = await db.sql`INSERT INTO members (h_number, primary_contact_email) VALUES (${id()}, ${primary}) RETURNING id`;
  const questions = [{ id: 'q1', number: 1, text: 'Syntetisk spørsmål?' }];
  await db.sql`INSERT INTO surveys (id, title, ends_on, questions) VALUES (${surveyId}, 'Syntetisk', '2099-12-31', ${JSON.stringify(questions)}::jsonb)`;
  const [response] = await db.sql`INSERT INTO survey_responses (member_id, survey_id, questions, answers, question_version, respondent_email)
    VALUES (${member.id}, ${surveyId}, ${JSON.stringify(questions)}::jsonb, '{"q1":"nei"}', 1, ${secondary}) RETURNING id`;
  const receiptIds = [id(), id()];
  for (const [index, receiptId] of receiptIds.entries()) await db.sql`INSERT INTO survey_response_receipts
    (id, response_id, member_id, survey_id, recipient_email, submitted_by, accepted, attempted_questions, attempted_answers)
    VALUES (${receiptId}, ${response.id}, ${member.id}, ${surveyId}, ${primary}, ${index ? primary : secondary}, ${!index},
      ${JSON.stringify(questions)}::jsonb, ${JSON.stringify({ q1: index ? 'ja' : 'nei' })}::jsonb)`;
  return { receiptIds, memberId: member.id, surveyId, primary, secondary };
}

test('real receipt worker excludes concurrent execution and sends winner plus later-attempt summaries only to primary', async () => {
  const f = await fixture();
  let started, release;
  const sending = new Promise((resolve) => { started = resolve; });
  const hold = new Promise((resolve) => { release = resolve; });
  const messages = [];
  const run = await worker(async (message) => { messages.push(message); started(); await hold; return { messageId: id() }; });
  const first = run();
  await Promise.race([sending, first.then(() => assert.fail('Worker did not send'))]);
  try { assert.equal((await run()).workerBusy, true); } finally { release(); }
  await first;
  await run();
  assert.equal(messages.length, 2);
  assert.ok(messages.every((message) => message.to === f.primary && message.text.includes(f.secondary) && message.text.includes('Nei')));
  assert.ok(messages.some((message) => message.text.includes('ikke tellende') && message.text.includes('Ja')));
  assert.equal((await db.sql`SELECT id FROM survey_response_receipts WHERE survey_id = ${f.surveyId} AND status = 'sent'`).length, 2);
  assert.equal((await db.sql`SELECT token FROM survey_receipt_worker WHERE singleton = TRUE`)[0].token, null);
});

test('changed contacts, suppression and interrupted processing never leak answers or resend uncertain receipts', async () => {
  const changed = await fixture(), suppressed = await fixture(), interrupted = await fixture();
  await db.sql`UPDATE members SET primary_contact_email = 'replacement@example.test' WHERE id = ${changed.memberId}`;
  await db.sql`INSERT INTO email_suppressions (recipient_email, reason) VALUES (${suppressed.primary}, 'synthetic')`;
  await db.sql`UPDATE survey_response_receipts SET status = 'processing', processing_at = NOW() - INTERVAL '17 minutes' WHERE survey_id = ${interrupted.surveyId}`;
  const run = await worker(async () => assert.fail('Unexpected send'));
  await run(); await run();
  for (const [f, status, reason] of [[changed, 'failed', 'PRIMARY_EMAIL_CHANGED_OR_MISSING'],
    [suppressed, 'suppressed', 'RECIPIENT_SUPPRESSED'], [interrupted, 'failed', 'UNCERTAIN_AFTER_INTERRUPTION']]) {
    const rows = await db.sql`SELECT status, failure_reason FROM survey_response_receipts WHERE survey_id = ${f.surveyId}`;
    assert.equal(rows.length, 2); assert.ok(rows.every((row) => row.status === status && row.failure_reason === reason));
  }
});

test('provider failure is recorded once and cannot create an automatic duplicate receipt', async () => {
  const f = await fixture(); let sends = 0;
  const run = await worker(async () => { sends++; throw Object.assign(new Error('Synthetic provider failure'), { code: 'SEND_FAILED' }); });
  await run(); await run();
  assert.equal(sends, 2);
  assert.equal((await db.sql`SELECT id FROM survey_response_receipts WHERE survey_id = ${f.surveyId} AND failure_reason = 'SEND_FAILED'`).length, 2);
});
