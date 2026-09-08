import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildSurveyResultsWorkbook, summarizeSurveyResponses } from '../lib/survey-results.js';

const questionsV1 = [
  { id: 'q1', number: 1, text: 'Første spørsmål?' },
  { id: 'q2', number: 2, text: 'Andre spørsmål?' },
];
const questionsV2 = [
  { id: 'q1', number: 1, text: 'Oppdatert første spørsmål?' },
];
const survey = {
  id: '11111111111111111111111111111111',
  title: 'Testundersøkelse',
  is_open: false,
  ends_on: '2026-09-01',
  has_ended: true,
  question_version: 2,
  questions: questionsV2,
};
const responses = [
  { question_version: 1, questions: questionsV1, answers: { q1: 'ja', q2: 'nei' }, created_at: '2026-08-01T10:00:00Z' },
  { question_version: 1, questions: questionsV1, answers: { q1: 'nei', q2: 'nei' }, created_at: '2026-08-02T10:00:00Z' },
  { question_version: 2, questions: questionsV2, answers: { q1: 'usikker' }, created_at: '2026-08-03T10:00:00Z' },
];

test('survey results retain question versions and calculate answer distributions', () => {
  const result = summarizeSurveyResponses(survey, responses);
  assert.equal(result.response_count, 3);
  assert.deepEqual(result.versions.map(({ version, response_count }) => ({ version, response_count })), [
    { version: 2, response_count: 1 },
    { version: 1, response_count: 2 },
  ]);
  assert.equal(result.versions[0].questions[0].text, 'Oppdatert første spørsmål?');
  assert.deepEqual(result.versions[1].questions[0].counts, { ja: 1, nei: 1, usikker: 0 });
  assert.deepEqual(result.versions[1].questions[0].percentages, { ja: 50, nei: 50, usikker: 0 });
});

test('survey results workbook contains summary and answer-level export', async () => {
  const buffer = await buildSurveyResultsWorkbook({ survey, responses });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const summary = workbook.getWorksheet('Oppsummering');
  const answers = workbook.getWorksheet('Besvarelser');
  assert.equal(summary.getCell('B4').value, 3);
  assert.equal(summary.getCell('C7').value, 'Oppdatert første spørsmål?');
  assert.deepEqual(answers.getRow(1).values.slice(1), ['Besvarelse', 'Mottatt', 'Spørsmålsversjon', 'Nr.', 'Spørsmål', 'Svar']);
  assert.equal(answers.rowCount, 6);
  assert.equal(answers.getCell('F2').value, 'Ja');
});
