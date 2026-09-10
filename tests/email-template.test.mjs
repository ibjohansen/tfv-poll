import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSurveyInvitationEmail } from '../lib/email-templates.js';
import { buildSurveyUrl, isPastSurveyEnd, parseTestRecipients, selectCampaignRecipients } from '../lib/survey-email-utils.js';

test('survey URL uses the existing token and survey parameter names', () => {
  const url = buildSurveyUrl({ baseUrl: 'https://medlemsservice.turufjellvel.no', accessToken: 'a'.repeat(32), surveyId: 'b'.repeat(32) });
  assert.equal(url, `https://medlemsservice.turufjellvel.no/survey?klm=${'a'.repeat(32)}&xyz=${'b'.repeat(32)}`);
  assert.throws(() => buildSurveyUrl({ baseUrl: 'https://example.test', accessToken: 'secret', surveyId: 'b'.repeat(32) }));
});

test('survey invitation has responsive HTML, CTA, visible URL and equivalent plain text', () => {
  const surveyUrl = `https://medlemsservice.turufjellvel.no/survey?klm=${'a'.repeat(32)}&xyz=${'b'.repeat(32)}`;
  const rendered = renderSurveyInvitationEmail({ surveyTitle: 'Test <survey>', endsOn: '2026-12-31', surveyUrl, baseUrl: 'https://medlemsservice.turufjellvel.no' });
  assert.match(rendered.html, /viewport/);
  assert.match(rendered.html, /Åpne undersøkelsen/);
  assert.match(rendered.html, /Test &lt;survey&gt;/);
  assert.match(rendered.html, /survey\?klm=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&amp;xyz=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/);
  assert.match(rendered.text, /31\.12\.2026/);
  assert.match(rendered.text, /klm=/);
  assert.doesNotMatch(rendered.html, /<script|fonts\.googleapis/i);
});

test('recipient selection excludes missing and invalid email addresses', () => {
  const selected = selectCampaignRecipients([
    { id: 1, primary_contact_email: 'ONE@EXAMPLE.COM' },
    { id: 2, primary_contact_email: '' },
    { id: 3, primary_contact_email: 'invalid' },
  ]);
  assert.deepEqual(selected.map(({ id, email }) => ({ id, email })), [{ id: 1, email: 'one@example.com' }]);
});

test('test recipients accept one or two comma-separated addresses only', () => {
  assert.deepEqual(parseTestRecipients(' ONE@example.com, two@example.com '), ['one@example.com', 'two@example.com']);
  assert.deepEqual(parseTestRecipients('one@example.com, one@example.com'), ['one@example.com']);
  assert.throws(() => parseTestRecipients('one@example.com, two@example.com, three@example.com'), /Invalid test recipient/);
  assert.throws(() => parseTestRecipients('one@example.com, ugyldig'), /Invalid test recipient/);
});

test('survey expiry follows the Europe/Oslo calendar date', () => {
  assert.equal(isPastSurveyEnd('2026-09-10', new Date('2026-09-10T21:30:00Z')), false);
  assert.equal(isPastSurveyEnd('2026-09-10', new Date('2026-09-10T22:30:00Z')), true);
});
