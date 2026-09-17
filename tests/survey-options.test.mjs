import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSurveyQuestions, hasValidSurveyAnswers, surveyAnswerLabel } from '../lib/survey-questions.js';
import { summarizeSurveyResponses, buildSurveyResultsWorkbook } from '../lib/survey-results.js';
import { selectCampaignRecipients, normalizeSurveyMemberIds } from '../lib/survey-email-utils.js';
import { renderSurveyInvitationEmail, renderSurveyReceiptEmail } from '../lib/email-templates.js';
import ExcelJS from 'exceljs';

const options = [{ value: 'o1', label: 'Mandag' }, { value: 'o2', label: 'Tirsdag' }];
const questions = normalizeSurveyQuestions([{ id: 'q1', text: ' Dag? ', options, multiple: true }, { id: 'q2', text: 'Enig?' }]);

test('question normalization preserves legacy format and custom stable option IDs', () => {
  assert.deepEqual(questions[1], { id: 'q2', number: 2, text: 'Enig?' });
  assert.equal(questions[0].text, 'Dag?');
  assert.deepEqual(questions[0].options, options);
  assert.equal(surveyAnswerLabel(questions[0], ['o2', 'o1']), 'Tirsdag, Mandag');
  for (const invalid of [[], [{ value: 'o1', label: '' }, options[1]], [options[0], options[0]], [options[0], { value: 'o3', label: ' mandag ' }], [{ value: '__proto__', label: 'A' }, options[1]]]) {
    assert.throws(() => normalizeSurveyQuestions([{ text: 'Test', options: invalid }]), /Invalid survey/);
  }
});

test('server validation enforces single/multiple choices, exact IDs and nonempty unique selections', () => {
  assert.equal(hasValidSurveyAnswers({ q1: ['o1', 'o2'], q2: 'ja' }, questions), true);
  for (const answer of ['o1', [], ['o1', 'o1'], ['o3'], [null], ['o1', 'nei']]) assert.equal(hasValidSurveyAnswers({ q1: answer, q2: 'nei' }, questions), false);
  assert.equal(hasValidSurveyAnswers({ q1: ['o1'], q2: ['ja'] }, questions), false);
  assert.equal(hasValidSurveyAnswers({ q1: ['o1'], q2: 'ja', injected: 'ja' }, questions), false);
  assert.equal(hasValidSurveyAnswers({ q1: ['o1'] }, questions), false);
});

test('multi-select results use respondents as denominator and export historical option labels', async () => {
  const survey = { id: 'a'.repeat(32), title: 'Syntetisk', question_version: 2, questions: [{ id: 'q1', text: 'Changed', options: [{ value: 'o1', label: 'Changed' }] }] };
  const responses = [{ question_version: 1, questions, answers: { q1: ['o1', 'o2'], q2: 'ja' } }, { question_version: 1, questions, answers: { q1: ['o1'], q2: 'nei' } }];
  const result = summarizeSurveyResponses(survey, responses);
  assert.equal(result.versions[0].questions[0].answered_count, 2);
  assert.deepEqual(result.versions[0].questions[0].percentages, { o1: 100, o2: 50 });
  assert.equal(result.versions[0].questions[0].options[0].label, 'Mandag');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildSurveyResultsWorkbook({ survey, responses }));
  assert.equal(workbook.getWorksheet('Besvarelser').getCell('F2').value, 'Mandag, Tirsdag');
});

test('mail selection defaults to primary email; extra emails are opt-in and deduplicated per property', () => {
  const members = [{ id: '1', primary_contact_email: ' Main@example.test ', other_contact_emails: ['other@example.test', 'MAIN@example.test', 'invalid'] }, { id: '2', primary_contact_email: 'main@example.test' }];
  assert.deepEqual(selectCampaignRecipients(members).map((row) => row.email), ['main@example.test', 'main@example.test']);
  const selected = selectCampaignRecipients(members, true);
  assert.deepEqual(selected.map((row) => row.email), ['main@example.test', 'other@example.test', 'main@example.test']);
  assert.deepEqual(selected[0].propertyRecipients, ['main@example.test', 'other@example.test']);
  assert.deepEqual(normalizeSurveyMemberIds(['1', 1, '2']), ['1', '2']);
  for (const bad of [['0'], ['x'], '1', Array(501).fill('1')]) assert.throws(() => normalizeSurveyMemberIds(bad));
});

test('invitations disclose co-recipients and first-wins rule without adding tracking', () => {
  const email = renderSurveyInvitationEmail({ surveyTitle: 'Test', endsOn: '2099-01-01', surveyUrl: 'https://example.test/survey', baseUrl: 'https://example.test', propertyRecipients: ['main@example.test', 'other@example.test'] });
  assert.match(email.text, /kun ETT svar/);
  assert.match(email.text, /main@example.test, other@example.test/);
  assert.match(email.html, /Den første innsendte/);
});

test('primary receipt distinguishes effective and later answers, including effective sender, with escaped HTML', () => {
  const email = renderSurveyReceiptEmail({ surveyTitle: '<script>Test</script>', hNumber: 'H123', submittedBy: 'main@example.test', accepted: false,
    effectiveRespondent: 'other@example.test', questions, answers: { q1: ['o1'], q2: 'ja' }, attemptedQuestions: questions, attemptedAnswers: { q1: ['o2'], q2: 'nei' }, baseUrl: 'https://example.test' });
  assert.match(email.text, /Tellende besvarelse fra: other@example.test/);
  assert.match(email.text, /Senere innsendt besvarelse \(ikke tellende\)/);
  assert.match(email.text, /Mandag/); assert.match(email.text, /Tirsdag/);
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /&lt;script&gt;/);
});
