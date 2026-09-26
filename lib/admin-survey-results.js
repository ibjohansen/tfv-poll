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

async function loadSurveyResponses(id, hamletId) {
  if (typeof hamletId !== 'string' || (hamletId !== '' && hamletId !== 'none' && !/^[1-9]\d{0,15}$/.test(hamletId))) throw new Error('Invalid survey hamlet filter');
  if (isMockMode()) {
    if (hamletId && hamletId !== 'none') throw new Error('Invalid survey hamlet filter');
    return { ...mockData(id), hamlets: [], hamletName: hamletId ? 'Uten grend' : 'Alle grender' };
  }
  const sql = getSql();
  const [survey] = await sql`
    SELECT id, title, is_open, ends_on, question_version, questions
    FROM surveys
    WHERE id = ${id} AND deleted_at IS NULL
  `;
  if (!survey) throw new Error('Survey not found');
  const hamlets = await sql`SELECT id::text AS id, name FROM member_hamlets WHERE deleted_at IS NULL ORDER BY lower(name), id`;
  const hamlet = hamlets.find((entry) => entry.id === hamletId);
  if (hamletId && hamletId !== 'none' && !hamlet) throw new Error('Invalid survey hamlet filter');
  const responses = await sql`
    SELECT r.question_version, r.answers, r.questions, r.created_at
    FROM survey_responses r
    LEFT JOIN members m ON m.id = r.member_id
    LEFT JOIN member_hamlets h ON h.id = m.hamlet_id AND h.deleted_at IS NULL
    WHERE r.survey_id = ${id}
      AND (${hamletId} = '' OR (${hamletId} = 'none' AND h.id IS NULL) OR h.id::text = ${hamletId})
    ORDER BY r.created_at, r.id
  `;
  return { survey: withStatus(survey), responses, hamlets, hamletName: hamlet?.name ?? (hamletId ? 'Uten grend' : 'Alle grender') };
}

export async function getAdminSurveyResults(id, hamletId = '') {
  await requirePermission('surveys');
  const data = await loadSurveyResponses(validateSurveyId(id), hamletId);
  return { ...summarizeSurveyResponses(data.survey, data.responses), hamlets: data.hamlets, hamlet_id: hamletId };
}

export async function createAdminSurveyResultsExport(id, hamletId = '') {
  const user = await requirePermission('surveys');
  const data = await loadSurveyResponses(validateSurveyId(id), hamletId);
  const buffer = await buildSurveyResultsWorkbook(data);
  if (!isMockMode()) await recordAdminExport(getSql(), { actor: user.email, action: 'survey_results_export', count: data.responses.length, scope: hamletId ? 'selected' : 'all', surveyId: data.survey.id });
  return {
    buffer,
    survey: data.survey,
    count: data.responses.length,
  };
}
