import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { buildSurveyResultsEmail } from '../lib/survey-results-email.js';
import { sendEmail } from '../lib/mailer-service.js';

test('result email embeds decodable PNGs with matching CID attachments and real lists', async () => {
  const results = { response_count: 274, versions: [{ version: 1, questions: [{ number: 1, text: 'Løfte <alpin>', answered_count: 274,
    options: [{ value: 'o1', label: 'Ja' }, { value: 'o2', label: 'Nei' }], counts: { o1: 159, o2: 115 }, percentages: { o1: 58, o2: 42 } }] }] };
  const message = await buildSurveyResultsEmail({ results, baseUrl: 'https://example.test', isTest: true });
  assert.doesNotMatch(message.html, /<svg|data:image|src="https:|white-space:pre-line/);
  assert.equal((message.html.match(/<ul /g) || []).length, 2);
  assert.equal((message.html.match(/<li /g) || []).length, 9);
  assert.match(message.html, /Styret i Turufjell vel/);
  assert.match(message.text, /Ja: 58 % \(159\)/);
  assert.match(message.html, /Løfte &lt;alpin&gt;/);
  const cids = [...message.html.matchAll(/src="cid:([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(cids, message.attachments.map(a => a.id));
  for (const attachment of message.attachments) {
    assert.equal(attachment.disposition, 'inline');
    const metadata = await sharp(Buffer.from(attachment.content, 'base64')).metadata();
    assert.equal(metadata.format, 'png');
    assert.ok(metadata.width >= 336);
  }
  let payload;
  await sendEmail({ ...message, to: 'test@example.test' }, {
    env: { MAILERSEND_ENABLED: 'true', MAILERSEND_API_TOKEN: 'synthetic', MAILERSEND_FROM_EMAIL: 'post@turufjellvel.no', MAILERSEND_DOMAIN_ID: 'synthetic' },
    fetchImpl: async (_url, options) => { payload = JSON.parse(options.body); return new Response(null, { status: 202, headers: { 'x-message-id': 'test-id' } }); },
  });
  assert.deepEqual(payload.attachments, message.attachments);
  assert.deepEqual(payload.to, [{ email: 'test@example.test' }]);
});
