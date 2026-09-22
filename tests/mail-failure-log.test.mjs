import test from 'node:test';
import assert from 'node:assert/strict';
import { sendEmail, getMailerSendSuppressions } from '../lib/mailer-service.js';
import { mailFailureDetails } from '../lib/mail-failure-log.js';

const env = { MAILERSEND_ENABLED: 'true', MAILERSEND_API_TOKEN: 'secret-api-token', MAILERSEND_FROM_EMAIL: 'post@turufjellvel.no', MAILERSEND_DOMAIN_ID: 'domain-test' };
const message = { to: 'private@example.invalid', toName: 'Private Person', subject: 'Private subject', text: 'Private message content', context: { emailType: 'survey_receipt', surveyId: 'survey-1', memberId: 10, receiptId: 'receipt-1' } };

test('provider errors persist a searchable audit event linked to the receipt, without secrets', async (t) => {
  const logs = [];
  t.mock.method(console, 'info', () => {});
  t.mock.method(console, 'error', (...args) => logs.push(args));
  const statements = [];
  const sql = async (parts, ...values) => { statements.push({ query: parts.join('?'), values }); return []; };
  const requestId = '83a57367-0e29-4cda-9e8a-0518e20c6400';
  let failure;
  await assert.rejects(sendEmail(message, { env, sql, fetchImpl: async () => Response.json({
    message: `Domain is not verified #MS42201 private@example.invalid Private Person secret-api-token Private message content https://site.invalid/?klm=secret`,
    errors: { 'from.email': ['Sender domain must be verified.'] },
  }, { status: 422, headers: { 'x-request-id': requestId } }) }), (error) => { failure = error; return error.code === 'UPSTREAM'; });
  assert.equal(statements.length, 1);
  assert.match(statements[0].query, /INSERT INTO audit_log/);
  const detail = JSON.parse(statements[0].values.at(-1));
  assert.equal(detail.error_id, failure.errorId);
  assert.equal(detail.mail_id, 'receipt:receipt-1');
  assert.equal(detail.survey_id, 'survey-1');
  assert.equal(detail.http_status, 422);
  assert.equal(detail.provider_code, 'MS42201');
  assert.equal(detail.request_id, requestId);
  assert.match(detail.provider_message, /Domain is not verified/);
  assert.deepEqual(detail.validation_errors, [{ field: 'from.email', messages: ['Sender domain must be verified.'] }]);
  assert.doesNotMatch(JSON.stringify([detail, logs]), /secret-api-token|private@example|Private Person|Private message content|klm=secret/);
});

test('network errors and non-JSON provider errors retain concrete diagnostics', async (t) => {
  t.mock.method(console, 'info', () => {}); t.mock.method(console, 'error', () => {});
  const events = [];
  const sql = async (_parts, ...values) => { events.push(JSON.parse(values.at(-1))); return []; };
  await assert.rejects(sendEmail(message, { env, sql, fetchImpl: async () => {
    throw new TypeError('fetch failed', { cause: Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED' }) });
  } }));
  assert.equal(events[0].network_code, 'ECONNREFUSED');
  assert.equal(events[0].provider_message, 'Connection refused');
  await assert.rejects(sendEmail(message, { env, sql, fetchImpl: async () => new Response('Upstream gateway timed out', { status: 504 }) }));
  assert.equal(events[1].http_status, 504);
  assert.equal(events[1].provider_message, 'Upstream gateway timed out');
});

test('suppression lookups log permission failures, and storage failure does not replace the original error', async (t) => {
  const logs = []; t.mock.method(console, 'error', (...args) => logs.push(args));
  await assert.rejects(getMailerSendSuppressions({ env, sql: async () => { throw new Error('database secret'); },
    fetchImpl: async () => Response.json({ message: 'Permission missing' }, { status: 403 }),
  }), (error) => error.code === 'SUPPRESSION_PERMISSION' && Boolean(error.errorId));
  assert.equal(logs[0][1].operation, 'suppression_lookup');
  assert.equal(logs[0][1].http_status, 403);
  assert.match(logs[1][0], /audit storage unavailable/);
  assert.doesNotMatch(JSON.stringify(logs), /database secret/);
});

test('failure metadata is bounded and strips credentials and links', () => {
  const detail = mailFailureDetails({ message: `Bearer very-private-secret https://host.invalid/secret someone@example.invalid ${'x'.repeat(2000)}`,
    providerErrors: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`field${i}`, Array(10).fill('y'.repeat(600))])),
  }, {}, { env: {} });
  assert.ok(detail.message.length <= 1000);
  assert.equal(detail.validation_errors.length, 10);
  assert.equal(detail.validation_errors[0].messages.length, 3);
  assert.doesNotMatch(detail.message, /very-private|host.invalid|someone@example/);
});
