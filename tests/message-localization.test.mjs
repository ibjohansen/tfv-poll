import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { emailDictionaries, getEmailI18n } from '../lib/i18n/email.js';
import { exportDictionaries, getExportI18n } from '../lib/i18n/exports.js';
import { getDictionary } from '../locales/index.js';
import { scopedTranslator } from '../lib/i18n/translate.js';
import { jobMessage, readJobMessage, jobMessageFromError, formatJobMessage } from '../lib/job-messages.js';
import { renderMemberAccessEmail, renderMembershipVerificationEmail, renderEmailChangeConfirmationEmail,
  renderEmailChangeNoticeEmail, renderSurveyInvitationEmail, renderSurveyReceiptEmail } from '../lib/email-templates.js';
import { buildSurveyResultsEmail } from '../lib/survey-results-email.js';
import { surveyResultsSections } from '../data/survey-results-message.js';
import { buildMemberWorkbook } from '../lib/member-workbook.js';
import { buildSurveyResultsWorkbook } from '../lib/survey-results.js';
import { accountingWorkbook } from '../lib/accounting-export.js';
import { sendEmail } from '../lib/mailer-service.js';
import { parseMatrikkelXml } from '../lib/matrikkel-client.js';

function flatten(value, prefix = '') {
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => typeof item === 'string'
    ? [[prefix + key, item]] : Object.entries(flatten(item, `${prefix}${key}.`))));
}
const jobT = (locale) => scopedTranslator(getDictionary(locale), 'jobs');
const baseUrl = 'https://example.test';
const actionUrl = `${baseUrl}/verify?token=synthetic`;

test('email, export and job dictionaries have matching keys and interpolation parameters', () => {
  for (const dictionaries of [emailDictionaries, exportDictionaries, { nb: getDictionary('nb').jobs, en: getDictionary('en').jobs }]) {
    const nb = flatten(dictionaries.nb), en = flatten(dictionaries.en);
    assert.deepEqual(Object.keys(nb).sort(), Object.keys(en).sort());
    for (const key of Object.keys(nb)) {
      const parameters = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      assert.deepEqual(parameters(nb[key]), parameters(en[key]), key);
      assert.ok(en[key].trim());
    }
  }
});

test('transactional emails use matching HTML/plain-text translations and retain secure link rules', () => {
  for (const render of [renderMemberAccessEmail, renderMembershipVerificationEmail,
    renderEmailChangeConfirmationEmail, renderEmailChangeNoticeEmail]) {
    for (const stage of ['old', 'new']) for (const completed of [true, false]) {
      const email = render({ baseUrl, actionUrl, locale: 'en', stage, completed });
      assert.equal(email.locale, 'en');
      assert.match(email.html, /lang="en"/);
      assert.ok(email.html.includes(getEmailI18n('en').t('footer')));
      assert.ok(email.text.includes(getEmailI18n('en').t('footer')));
      assert.doesNotMatch(email.html, /undefined|\{validity\}/);
      if (render !== renderEmailChangeNoticeEmail) {
        assert.match(email.text, /15 minutes/);
        assert.match(email.text, /must not be forwarded/);
        assert.ok(email.text.includes(actionUrl));
      }
    }
  }
  assert.match(renderMemberAccessEmail({ baseUrl, actionUrl, locale: 'unsupported' }).html, /lang="nb"/);
});

test('survey email localization preserves escaping, first-response policy and historical answer labels', () => {
  const email = renderSurveyInvitationEmail({ baseUrl, surveyUrl: actionUrl, endsOn: '2026-12-31',
    surveyTitle: '<img src=x onerror=alert(1)>', locale: 'en', propertyRecipients: ['first@example.test', 'second@example.test'] });
  assert.match(email.html, /&lt;img/); assert.doesNotMatch(email.html, /<img src=x/);
  assert.match(email.text, /Only one response/); assert.match(email.text, /first@example.test, second@example.test/);
  assert.match(email.text, /Thursday/); assert.match(email.html, /<strong>Thursday/);
  const receipt = renderSurveyReceiptEmail({ baseUrl, locale: 'en', surveyTitle: 'Historical title', hNumber: 'H-test',
    submittedBy: 'one@example.test', effectiveRespondent: 'first@example.test', accepted: false,
    questions: [{ id: 'q1', text: 'Historisk spørsmål', options: [{ value: 'x', label: 'Opprinnelig etikett' }] }], answers: { q1: 'x' },
    attemptedQuestions: [], attemptedAnswers: {} });
  assert.match(receipt.text, /Only the first response counts/);
  assert.match(receipt.text, /Historisk spørsmål\nOpprinnelig etikett/);
});

test('PNG result email retains approved editorial content, inline images and paired chart layout', async () => {
  const question = { number: 1, text: 'Original question', answered_count: 1,
    options: [{ value: 'x', label: 'Original label' }], counts: { x: 1 }, percentages: { x: 100 } };
  const email = await buildSurveyResultsEmail({ baseUrl, locale: 'en', results: { response_count: 1,
    versions: [{ version: 1, questions: [question, { ...question, number: 2 }] }] } });
  assert.match(email.html, /Distribution of responses/); assert.match(email.html, /Question 1/);
  assert.match(email.html, /class="result-column" width="50%"/);
  assert.equal(email.attachments.length, 3);
  for (const attachment of email.attachments) assert.equal(Buffer.from(attachment.content, 'base64').subarray(1, 4).toString(), 'PNG');
  for (const [heading, text] of surveyResultsSections) assert.ok(email.text.includes(`${heading}\n\n${text}`));
  assert.doesNotMatch(email.html, /<!--survey-results-charts-->|<svg/);
});

test('localized exports preserve numeric cells and original survey snapshots', async () => {
  const memberBook = new ExcelJS.Workbook();
  await memberBook.xlsx.load(await buildMemberWorkbook({ locale: 'en', members: [{ h_number: '10', membership_status: 'exempt' }] }));
  const members = memberBook.getWorksheet('Members');
  assert.equal(members.getCell('A2').value, 10); assert.equal(members.getCell('J2').value, 'Exempt from membership');
  const questions = [{ id: 'q1', text: 'Historisk spørsmål', options: [{ value: 'x', label: 'Historisk svar' }] }];
  const surveyBook = new ExcelJS.Workbook();
  await surveyBook.xlsx.load(await buildSurveyResultsWorkbook({ locale: 'en', survey: { id: 'test', title: 'Original', questions },
    responses: [{ question_version: 1, questions, answers: { q1: 'x' } }] }));
  assert.equal(surveyBook.getWorksheet('Summary').getCell('B5').value, 'All hamlets');
  assert.equal(surveyBook.getWorksheet('Responses').getCell('F2').value, 'Historisk svar');
  const costBook = new ExcelJS.Workbook();
  await costBook.xlsx.load(await accountingWorkbook({ expenses: [], attachments: [] }, scopedTranslator(getDictionary('en'), 'accounting'), 'en'));
  assert.ok(costBook.getWorksheet('Expenses'));
  assert.equal(getExportI18n('bad').locale, 'nb');
});

test('versioned job messages persist only known codes and bounded parameters and render in either language', () => {
  const stored = jobMessage('UPSTREAM_HTTP', { httpStatus: 503, secret: 'never store this' });
  assert.deepEqual(readJobMessage(stored), { code: 'UPSTREAM_HTTP', params: { httpStatus: '503' } });
  assert.equal(formatJobMessage(stored, jobT('nb')), 'Ekstern tjeneste svarte med HTTP 503.');
  assert.equal(formatJobMessage(stored, jobT('en')), 'The external service returned HTTP 503.');
  assert.doesNotMatch(stored, /secret|never store/);
  assert.equal(formatJobMessage('Ekstern tjeneste svarte med HTTP 503.', jobT('en')), 'The external service returned HTTP 503.');
  assert.equal(readJobMessage('Fant ikke matrikkelenhet for 10/20.').params.gnr, '10');
  assert.equal(readJobMessage('Kjøringen ble stoppet manuelt.').code, 'JOB_CANCELLED');
  assert.equal(readJobMessage('Avbrutt behandling etter tre forsøk. Start en ny kontrollert kjøring.').params.attempts, 3);
  assert.equal(readJobMessage(jobMessage('UPSTREAM_HTTP', { httpStatus: '<script>secret</script>' })).params.httpStatus, '–');
});

test('unknown, damaged and hostile errors never become a raw UI message', () => {
  const fallback = jobT('en')('UNKNOWN');
  for (const value of ['secret user@example.test', 'tfv-message:v1:{', 'tfv-message:v9:{}',
    'tfv-message:v1:{"code":"__proto__","params":{}}', 'x'.repeat(3000)]) {
    assert.equal(formatJobMessage(value, jobT('en')), fallback);
  }
  const stored = jobMessageFromError(Object.assign(new Error('credential in provider response'), {
    code: 'untrusted', providerMessage: 'more credentials' }));
  assert.equal(formatJobMessage(stored, jobT('en')), fallback);
  assert.doesNotMatch(stored, /credential|provider/);
  assert.throws(() => parseMatrikkelXml('<Envelope><Body><Fault><faultstring>credential</faultstring></Fault></Body></Envelope>'),
    (error) => error.messageCode === 'MATRIKKEL_SOAP_FAULT' && !JSON.stringify(error).includes('credential'));
});

test('mailer preserves an English footer once and excludes locale from provider payload', async () => {
  const rendered = renderMemberAccessEmail({ baseUrl, actionUrl, locale: 'en' });
  let payload;
  await sendEmail({ ...rendered, to: 'synthetic@example.test' }, {
    env: { MAILERSEND_ENABLED: 'true', MAILERSEND_API_TOKEN: 'synthetic', MAILERSEND_FROM_EMAIL: 'post@turufjellvel.no', MAILERSEND_DOMAIN_ID: 'synthetic' },
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body);
      return new Response(null, { status: 202, headers: { 'x-message-id': 'synthetic' } });
    },
  });
  assert.equal(payload.locale, undefined);
  assert.equal(payload.text.split(getEmailI18n('en').t('footer')).length, 2);
  assert.doesNotMatch(payload.text, /Denne e-posten/);
});
