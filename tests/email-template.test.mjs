import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNorwegianDateTime, renderMemberAccessEmail, renderMembershipVerificationEmail, renderSurveyInvitationEmail, SYSTEM_EMAIL_FOOTER } from '../lib/email-templates.js';
import { buildSurveyUrl, isPastSurveyEnd, parseTestRecipients, selectCampaignRecipients } from '../lib/survey-email-utils.js';

test('survey URL uses a one-time 256-bit token without exposing member or survey IDs', () => {
  const url = buildSurveyUrl({ baseUrl: 'https://medlemsservice.turufjellvel.no', accessToken: 'a'.repeat(64), surveyId: 'b'.repeat(32) });
  assert.equal(url, `https://medlemsservice.turufjellvel.no/api/survey-access/verify?token=${'a'.repeat(64)}`);
  assert.throws(() => buildSurveyUrl({ baseUrl: 'https://example.test', accessToken: 'secret', surveyId: 'b'.repeat(32) }));
});

test('survey invitation has responsive HTML, CTA, visible URL and equivalent plain text', () => {
  const surveyUrl = `https://medlemsservice.turufjellvel.no/api/survey-access/verify?token=${'a'.repeat(64)}`;
  const rendered = renderSurveyInvitationEmail({ surveyTitle: 'Test <survey>', endsOn: '2026-12-31', surveyUrl, baseUrl: 'https://medlemsservice.turufjellvel.no' });
  assert.match(rendered.html, /viewport/);
  assert.match(rendered.html, /Åpne undersøkelsen/);
  assert.match(rendered.html, /Test &lt;survey&gt;/);
  assert.match(rendered.html, /survey-access\/verify\?token=aaaaaaaa/);
  assert.match(rendered.text, /Torsdag 31\. desember 2026 kl\. 00:00/);
  assert.match(rendered.text, new RegExp(SYSTEM_EMAIL_FOOTER.replace('.', '\\.')));
  assert.match(rendered.text, /token=/);
  assert.doesNotMatch(rendered.html, /<script|fonts\.googleapis/i);
});

test('survey test email links to a non-persisting preview', () => {
  const surveyUrl = 'https://medlemsservice.turufjellvel.no/survey?preview=signed-token';
  const rendered = renderSurveyInvitationEmail({ surveyTitle: 'Test', endsOn: '2026-12-31', surveyUrl, baseUrl: 'https://medlemsservice.turufjellvel.no', isTest: true });
  assert.match(rendered.html, /Forhåndsvis undersøkelsen/);
  assert.match(rendered.html, /testinnsending lagres ikke/);
  assert.match(rendered.text, /forhåndsvisning/i);
  assert.match(rendered.text, /preview=signed-token/);
});

test('member access and membership verification emails contain a visible 15-minute secret link', () => {
  const actionUrl = `https://medlemsservice.turufjellvel.no/api/member-access/verify?token=${'a'.repeat(64)}`;
  for (const rendered of [
    renderMemberAccessEmail({ actionUrl, baseUrl: 'https://medlemsservice.turufjellvel.no' }),
    renderMembershipVerificationEmail({ actionUrl, baseUrl: 'https://medlemsservice.turufjellvel.no' }),
  ]) {
    assert.match(rendered.html, /varer i 15 minutter/);
    assert.match(rendered.html, /token=aaaaaaaa/);
    assert.match(rendered.text, /varer i 15 minutter/);
    assert.match(rendered.text, /skal ikke videresendes/);
    assert.match(rendered.text, /kopiere adressen.*lime den inn i nettleseren/);
    assert.match(rendered.text, new RegExp(SYSTEM_EMAIL_FOOTER.replace('.', '\\.')));
    assert.doesNotMatch(rendered.html, /<script|fonts\.googleapis/i);
  }
});

test('correspondence dates use Norwegian weekday, month and time', () => {
  assert.equal(formatNorwegianDateTime('2027-09-07'), 'Tirsdag 7. september 2027 kl. 00:00');
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
