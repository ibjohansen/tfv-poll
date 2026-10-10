import test from 'node:test';
import assert from 'node:assert/strict';
import { getMailerSendConfig, getMailerSendSuppressions, getMailerSendSuppressionDetails, getMailerSendRecipientDiagnostics, isMailerSendBulkEnabled, isSuppressedRecipient, MailerServiceError, requireMailerSendBulkEnabled, sendEmail } from '../lib/mailer-service.js';

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

test('MailerSend rate limits expose a bounded retry time without becoming recipient failures', async () => {
  const before = Date.now();
  await assert.rejects(sendEmail({ to: 'member@example.com', subject: 'Test', text: 'Hei' }, {
    env,
    fetchImpl: async () => Response.json({ message: 'Too many requests #MS42903' }, {
      status: 429, headers: { 'retry-after': '30' },
    }),
  }), (error) => error instanceof MailerServiceError
    && error.code === 'MAILERSEND_RATE_LIMIT'
    && error.status === 429
    && Date.parse(error.retryAt) >= before + 30_000);

  const reset = new Date(Date.now() + 3_600_000).toISOString();
  await assert.rejects(sendEmail({ to: 'member@example.com', subject: 'Test', text: 'Hei' }, {
    env,
    fetchImpl: async () => Response.json({ message: 'Daily quota #MS42901' }, {
      status: 429, headers: { 'x-apiquota-remaining': '0', 'x-apiquota-reset': reset },
    }),
  }), (error) => error instanceof MailerServiceError
    && error.code === 'MAILERSEND_DAILY_QUOTA'
    && error.retryAt === reset);
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

test('suppression diagnostics retain category, date, IDs and sanitized reasons across pages and domain matches',async()=>{
 const calls=[];
 const suppressions=await getMailerSendSuppressions({env,fetchImpl:async url=>{
  calls.push(url);const query=new URL(url);
  if(query.pathname.endsWith('/hard-bounces'))return Response.json({data:query.searchParams.get('page')==='1'
   ?Array.from({length:100},(_,i)=>({id:`suppression-${i}`,recipient:{id:`recipient-${i}`,email:i===0?'member@example.com':`other${i}@example.com`},created_at:'2026-09-18 16:36:57',reason:`550 5.1.1 <b>Unknown</b> member@example.com Bearer ${env.MAILERSEND_API_TOKEN}`}))
   :[{id:'second-page',recipient:{email:'later@example.com'},reason:'Mailbox unavailable'}]});
  if(query.pathname.endsWith('/blocklist'))return Response.json({data:[{id:'domain-rule',pattern:'.*@blocked.example',created_at:'2026-09-18T16:36:57Z'}]});
  return Response.json({data:[]});
 }});
 const [detail]=getMailerSendSuppressionDetails('MEMBER@example.com',suppressions);
 assert.equal(detail.type,'hard-bounces');assert.equal(detail.created_at,'2026-09-18T16:36:57.000Z');assert.equal(detail.recipient_id,'recipient-0');assert.equal(detail.enhanced_code,'5.1.1');
 assert.doesNotMatch(detail.reason,/<b>|member@example.com|synthetic-token/);assert.equal(getMailerSendSuppressionDetails('later@example.com',suppressions)[0].reason,'Mailbox unavailable');
 assert.equal(getMailerSendSuppressionDetails('any@blocked.example',suppressions)[0].matched_domain,'blocked.example');
 assert.ok(calls.some(url=>url.includes('page=2')));assert.deepEqual(getMailerSendSuppressionDetails('ok@example.com',suppressions),[]);
});

test('recipient diagnostics use only GET and omit message content, subject and unrelated metadata',async()=>{
 const result=await getMailerSendRecipientDiagnostics('recipient-1',{env,fetchImpl:async(url,options)=>{
  assert.equal(url,'https://api.mailersend.com/v1/recipients/recipient-1');assert.equal(options.method,'GET');
  return Response.json({data:{email:'member@example.com',domain:{secret:'private'},emails:[{id:'email-1',status:'hard_bounced',html:'PRIVATE CONTENT',subject:'PRIVATE SUBJECT',reason:'550 5.1.1 Not found',created_at:'2026-09-18 16:36:57'}]}});
 }});
 assert.equal(result.emails[0].reason,'550 5.1.1 Not found');assert.doesNotMatch(JSON.stringify(result),/PRIVATE|member@example.com|secret/);
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
