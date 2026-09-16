import test from 'node:test';
import assert from 'node:assert/strict';
import { getMailerSendConfig, getMailerSendSuppressions, isMailerSendBulkEnabled, isSuppressedRecipient, MailerServiceError, requireMailerSendBulkEnabled, sendEmail } from '../lib/mailer-service.js';

const env = {
  MAILERSEND_ENABLED: 'true',
  MAILERSEND_API_TOKEN: 'secret-api-token',
  MAILERSEND_FROM_EMAIL: 'post@turufjellvel.no',
  MAILERSEND_FROM_NAME: 'Turufjell Vel',
  MAILERSEND_DOMAIN_ID: 'domain-1',
};

test('valid MailerSend configuration remains server-side', () => {
  const config = getMailerSendConfig(env);
  assert.equal(config.fromEmail, 'post@turufjellvel.no');
  assert.equal(config.replyTo, 'post@turufjellvel.no');
});

test('MailerSend configuration requires enabled flag, token and valid from address', () => {
  for (const [override, code] of [
    [{ MAILERSEND_ENABLED: 'false' }, 'DISABLED'],
    [{ MAILERSEND_API_TOKEN: '' }, 'CONFIGURATION'],
    [{ MAILERSEND_FROM_EMAIL: '' }, 'CONFIGURATION'],
    [{ MAILERSEND_FROM_EMAIL: 'post@example.com' }, 'CONFIGURATION'],
  ]) {
    assert.throws(() => getMailerSendConfig({ ...env, ...override }), (error) => error instanceof MailerServiceError && error.code === code);
  }
});

test('bulk email remains locked unless separately enabled', () => {
  assert.equal(isMailerSendBulkEnabled(env), false);
  assert.throws(() => requireMailerSendBulkEnabled(env), (error) => error instanceof MailerServiceError && error.code === 'BULK_DISABLED' && error.status === 403);
  assert.equal(isMailerSendBulkEnabled({ ...env, MAILERSEND_BULK_ENABLED: 'true' }), true);
});

test('sendEmail validates recipient before making a provider call', async () => {
  let called = false;
  await assert.rejects(sendEmail({ to: 'not-an-email', subject: 'Test', text: 'Hei' }, { env, fetchImpl: async () => { called = true; } }), (error) => error.code === 'INVALID_RECIPIENT');
  assert.equal(called, false);
});

test('sendEmail sends HTML and plain text with tracking disabled and returns message ID', async () => {
  let request;
  const result = await sendEmail({ to: 'Member@Example.com', subject: 'Undersøkelse', html: '<p>Hei &amp; velkommen</p>' }, {
    env,
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return new Response(null, { status: 202, headers: { 'x-message-id': 'message-123' } });
    },
  });
  assert.equal(result.messageId, 'message-123');
  assert.equal(request.url, 'https://api.mailersend.com/v1/email');
  assert.equal(request.body.to[0].email, 'member@example.com');
  assert.match(request.body.text, /Hei & velkommen/);
  assert.match(request.body.text, /Denne e-posten er sendt fra Medlemsservice i Turufjell Vel\./);
  assert.match(request.body.html, /Denne e-posten er sendt fra Medlemsservice i Turufjell Vel\./);
  assert.deepEqual(request.body.settings, { track_clicks: false, track_opens: false, track_content: false });
  assert.equal(request.options.headers.Authorization, `Bearer ${env.MAILERSEND_API_TOKEN}`);
});

test('provider failure is controlled and logs no token, body or survey URL', async () => {
  const entries = [];
  const original = console.info;
  console.info = (...args) => entries.push(args);
  try {
    await assert.rejects(sendEmail({
      to: 'member@example.com', subject: 'Undersøkelse',
      html: '<a href="https://example.test/survey?klm=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">Svar</a>',
      context: { emailType: 'survey_invitation', surveyId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', recipient: 'member@example.com' },
    }, { env, fetchImpl: async () => new Response('{}', { status: 422 }) }), (error) => error.code === 'UPSTREAM' && error.status === 502);
  } finally { console.info = original; }
  const logged = JSON.stringify(entries);
  assert.doesNotMatch(logged, /secret-api-token|klm=|member@example\.com|<a/);
  assert.match(logged, /example\.com/);
});

test('suppression lookup checks provider lists and domain block patterns', async () => {
  const suppressions = await getMailerSendSuppressions({ env, fetchImpl: async (url) => {
    if (url.includes('/blocklist?')) return Response.json({ data: [{ pattern: '.*@blocked.example' }] });
    if (url.includes('/hard-bounces?')) return Response.json({ data: [{ recipient: { email: 'bounce@example.com' } }] });
    return Response.json({ data: [] });
  } });
  assert.equal(isSuppressedRecipient('bounce@example.com', suppressions), true);
  assert.equal(isSuppressedRecipient('any@blocked.example', suppressions), true);
  assert.equal(isSuppressedRecipient('ok@example.com', suppressions), false);
});

test('suppression permission failure is reported distinctly', async () => {
  await assert.rejects(
    getMailerSendSuppressions({ env, fetchImpl: async () => new Response(null, { status: 403 }) }),
    (error) => error instanceof MailerServiceError && error.code === 'SUPPRESSION_PERMISSION' && error.status === 503,
  );
});

test('suppression lookup propagates the request deadline', async () => {
  const controller = new AbortController();
  const reason = Object.assign(new Error('deadline'), { name: 'TimeoutError' });
  const lookup = getMailerSendSuppressions({
    env, signal: controller.signal,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    }),
  });
  controller.abort(reason);
  await assert.rejects(lookup, (error) => error === reason);
});
