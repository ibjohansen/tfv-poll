import { getSql } from './db.js';
import { requirePermission } from './admin-access.js';
import { isMockMode } from './mock-store.js';
import { surveyEndsOn, surveyId, surveyQuestions, surveyVersion } from '../data/survey.js';
import { normalizeSurveyEndDate, surveyHasEnded } from './survey-dates.js';
import { buildSurveyResultsWorkbook, summarizeSurveyResponses } from './survey-results.js';
import { recordAdminExport } from './admin-activity.js';

function validateSurveyId(id) {
  if (!/^[a-f0-9]{32}$/i.test(id || '')) throw new Error('Invalid survey ID');
  return id.toLowerCase();
}

function withStatus(survey) {
  const endsOn = normalizeSurveyEndDate(survey.ends_on);
  return { ...survey, ends_on: endsOn, has_ended: surveyHasEnded(endsOn) };
}

function mockData(id) {
  if (id !== surveyId) throw new Error('Survey not found');
  const survey = withStatus({
    id: surveyId,
    title: 'Medlemsundersøkelse om Kristnatten',
    is_open: true,
    ends_on: surveyEndsOn,
    question_version: surveyVersion,
    questions: surveyQuestions,
  });
  const responses = [{
    question_version: surveyVersion,
    questions: surveyQuestions,
    answers: { q1: 'ja', q2: 'nei', q3: 'usikker', q4: 'ja' },
    created_at: new Date().toISOString(),
  }];
  return { survey, responses };
}

async function loadSurveyResponses(id) {
  if (isMockMode()) return mockData(id);
  const sql = getSql();
  const [survey] = await sql`
    SELECT id, title, is_open, ends_on, question_version, questions
    FROM surveys
    WHERE id = ${id} AND deleted_at IS NULL
  `;
  if (!survey) throw new Error('Survey not found');
  const responses = await sql`
    SELECT question_version, answers, questions, created_at
    FROM survey_responses
    WHERE survey_id = ${id}
    ORDER BY created_at, id
  `;
  return { survey: withStatus(survey), responses };
}

export async function getAdminSurveyResults(id) {
  await requirePermission('surveys');
  const data = await loadSurveyResponses(validateSurveyId(id));
  return summarizeSurveyResponses(data.survey, data.responses);
}

export async function createAdminSurveyResultsExport(id) {
  const user = await requirePermission('surveys');
  const data = await loadSurveyResponses(validateSurveyId(id));
  const buffer = await buildSurveyResultsWorkbook(data);
  if (!isMockMode()) await recordAdminExport(getSql(), { actor: user.email, action: 'survey_results_export', count: data.responses.length, scope: 'all', surveyId: data.survey.id });
  return {
    buffer,
    survey: data.survey,
    count: data.responses.length,
  };
}
