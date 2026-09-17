import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadModule } from './helpers/load-module.mjs';
import { renderSurveyReceiptEmail } from '../lib/email-templates.js';

async function fixture({ busy = false, configured = true, changed = false, suppressed = false, providerFailure = false } = {}) {
  const calls = [], sends = [];
  let claimed = false;
  const sql = async (strings, ...values) => {
    const query = strings.join('?'); calls.push({ query, values });
    if (query.includes('UPDATE survey_receipt_worker SET token = ?')) return busy ? [] : [{ singleton: true }];
    if (query.includes('RETURNING *')) {
      if (claimed) return [];
      claimed = true;
      return [{ id: 'a'.repeat(32), response_id: '1', survey_id: 'b'.repeat(32), member_id: '7',
        recipient_email: 'primary@example.invalid', submitted_by: 'secondary@example.invalid', accepted: true,
        attempted_questions: [{ id: 'q1', text: 'Test?' }], attempted_answers: { q1: 'ja' } }];
    }
    if (query.includes('FROM members m JOIN surveys')) return [{ primary_contact_email: changed ? 'new@example.invalid' : 'primary@example.invalid',
      h_number: 'H7', title: 'Syntetisk test', questions: [{ id: 'q1', text: 'Test?' }], answers: { q1: 'ja' }, respondent_email: 'secondary@example.invalid' }];
    if (query.includes('FROM email_suppressions')) return suppressed ? [{ recipient_email: 'primary@example.invalid' }] : [];
    if (query.includes('SELECT EXISTS')) return [{ pending: false }];
    return [];
  };
  const api = await loadModule('lib/survey-receipts.js', {
    './db.js': { getSql: () => sql }, 'node:crypto': { randomUUID },
    './security-config.js': { assertDatabaseEnvironment: async () => {} },
    './mailer-service.js': { isMailerSendConfigured: () => configured,
      normalizeEmail: (value) => String(value || '').trim().toLowerCase(), isSuppressedRecipient: () => false,
      getMailerSendSuppressions: async () => [], sendEmail: async (message) => {
        sends.push(message);
        if (providerFailure) throw Object.assign(new Error('private provider details'), { code: 'SEND_FAILED' });
        return { messageId: 'synthetic-message' };
      } },
    './email-templates.js': { renderSurveyReceiptEmail },
    './survey-email.js': { getApplicationBaseUrl: () => 'https://example.invalid' },
  });
  return { run: (options = {}) => api.processSurveyReceipts({ delayMs: 0, ...options }), calls, sends };
}

test('receipts go only to the current primary email, with effective answers and a released lease', async () => {
  const { run, calls, sends } = await fixture();
  assert.equal((await run()).pending, false);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].to, 'primary@example.invalid');
  assert.match(sends[0].text, /secondary@example.invalid/);
  assert.match(sends[0].text, /Test\?/);
  assert.ok(calls.some(({ query }) => query.includes("status = 'sent'")));
  assert.match(calls.at(-1).query, /SET token = NULL/);
});

test('a busy or disabled receipt worker never claims or sends a message', async () => {
  for (const options of [{ busy: true }, { configured: false }]) {
    const { run, calls, sends } = await fixture(options);
    const result = await run();
    assert.ok(result.disabled || result.workerBusy);
    assert.equal(sends.length, 0);
    assert.ok(calls.every(({ query }) => !query.includes('RETURNING *')));
  }
});

test('changed primary email and suppressed recipients do not receive private answers', async () => {
  for (const options of [{ changed: true }, { suppressed: true }]) {
    const { run, calls, sends } = await fixture(options);
    await run();
    assert.equal(sends.length, 0);
    assert.ok(calls.some(({ query }) => /PRIMARY_EMAIL_CHANGED_OR_MISSING|RECIPIENT_SUPPRESSED/.test(query)));
    assert.match(calls.at(-1).query, /SET token = NULL/);
  }
});

test('uncertain and failed receipt attempts are not automatically sent again', async () => {
  const { run, calls, sends } = await fixture({ providerFailure: true });
  await run(); await run();
  assert.equal(sends.length, 1);
  assert.ok(calls.some(({ query }) => query.includes('UNCERTAIN_AFTER_INTERRUPTION')));
  assert.ok(calls.some(({ values }) => values.includes('SEND_FAILED')));
  assert.ok(calls.every(({ values }) => !values.includes('private provider details')));
});

test('receipt lease is released when provider suppression lookup fails', async () => {
  const { run, calls, sends } = await fixture();
  await assert.rejects(run({ getSuppressions: async () => { throw new Error('unavailable'); } }), /unavailable/);
  assert.equal(sends.length, 0);
  assert.match(calls.at(-1).query, /SET token = NULL/);
});

test('watchdog isolates receipt errors from Matrikkel recovery and rejects non-production context', async () => {
  let recovered = 0, queried = 0;
  const api = await loadModule('netlify/functions/background-watchdog.mjs', {
    '../../lib/db.js': { getSql: () => async () => { queried++; throw new Error('private database failure'); } },
    '../../lib/background-watchdog.js': { recoverStalledMatrikkelRuns: async () => { recovered++; return { result: 'idle' }; } },
    '../../lib/survey-email-background.js': { dispatchSurveyReceipts: async () => assert.fail('unexpected dispatch') },
  }, { process: { env: { APP_ENVIRONMENT: 'production' } } });
  await api.default({}, { deploy: { context: 'deploy-preview' } });
  assert.equal(queried, 0);
  await assert.rejects(api.default({}, { deploy: { context: 'production' } }), { message: 'Background watchdog failed' });
  assert.equal(recovered, 1);
});
