import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSurveyPreviewUrl,
  createSurveyPreviewToken,
  getSurveyPreview,
  verifySurveyPreviewToken,
} from '../lib/survey-preview.js';

const env = {
  APP_ENVIRONMENT: 'development',
  TOKEN_AUDIENCE: 'tfv-preview-test',
  SECURITY_EVENT_HMAC_KEY: 'survey-preview-test-key-with-at-least-32-bytes',
};

test('survey preview tokens are stateless, scoped and expire after 24 hours', () => {
  const now = Date.now();
  const surveyId = 'a'.repeat(32);
  const token = createSurveyPreviewToken({ surveyId, questionVersion: 7 }, env, now);
  const claims = verifySurveyPreviewToken(token, env, now + 1000);
  assert.equal(claims.surveyId, surveyId);
  assert.equal(claims.questionVersion, 7);
  assert.equal(claims.expiresAt.getTime(), Math.floor(now / 1000) * 1000 + 24 * 60 * 60 * 1000);
  assert.equal(verifySurveyPreviewToken(token, env, now + 24 * 60 * 60 * 1000), null);
  assert.equal(verifySurveyPreviewToken(token, { ...env, TOKEN_AUDIENCE: 'another-audience' }, now + 1000), null);
});

test('survey preview rejects tampering and builds a URL without member data', () => {
  const token = createSurveyPreviewToken({ surveyId: 'b'.repeat(32), questionVersion: 2 }, env);
  const [payload, signature] = token.split('.');
  const changedPayload = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}`;
  assert.equal(verifySurveyPreviewToken(`${changedPayload}.${signature}`, env), null);
  const url = buildSurveyPreviewUrl({ baseUrl: 'https://medlemsservice.turufjellvel.no', token }, env);
  assert.match(url, /^https:\/\/medlemsservice\.turufjellvel\.no\/survey\?preview=/);
  assert.doesNotMatch(url, /member|email|h_number/i);
});

test('loading a survey preview performs reads only and signs attachment access', async () => {
  const now = Date.now();
  const surveyId = 'c'.repeat(32);
  const attachmentId = 'd'.repeat(32);
  const token = createSurveyPreviewToken({ surveyId, questionVersion: 3 }, env, now);
  const statements = [];
  async function sql(strings) {
    const statement = strings.join('?');
    statements.push(statement);
    if (statement.includes('application_environment')) return [{ environment: 'development' }];
    if (statement.includes('FROM surveys')) return [{
      id: surveyId, title: 'Forhåndsvisning', ends_on: '2099-12-31', question_version: 3,
      questions: [{ id: 'q1', number: 1, text: 'Et spørsmål' }], single_response_per_property: true,
    }];
    if (statement.includes('FROM survey_attachments')) return [{
      id: attachmentId, title: 'Vedlegg', original_filename: 'vedlegg.pdf',
      mime_type: 'application/pdf', size_bytes: 42, sort_order: 0,
    }];
    throw new Error(`Unexpected SQL: ${statement}`);
  }
  const survey = await getSurveyPreview(token, { sql, env, now: now + 1000 });
  assert.equal(survey.id, surveyId);
  assert.equal(survey.questions[0].text, 'Et spørsmål');
  assert.match(survey.attachments[0].url, new RegExp(`^/api/survey/files/${attachmentId}\\?preview=`));
  assert.ok(statements.every((statement) => /^\s*SELECT\b/i.test(statement)));
});
