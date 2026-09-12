import { getSql } from './db.js';
import { randomUUID } from 'node:crypto';
import { isMockMode } from './mock-store.js';
import { surveyEndsOn, surveyId, surveyVersion } from '../data/survey.js';
import { surveyQuestions } from '../data/survey.js';
import { requirePermission } from './admin-access.js';
import { isValidSurveyEndDate, normalizeSurveyEndDate, surveyHasEnded } from './survey-dates.js';

const sortColumns = { title: 's.title', is_open: 's.is_open', ends_on: 's.ends_on', response_count: 'response_count', question_version: 's.question_version' };

function withStatus(survey) {
  const endsOn = normalizeSurveyEndDate(survey.ends_on);
  return { ...survey, ends_on: endsOn, has_ended: surveyHasEnded(endsOn) };
}

function normalizeQuestions(questions) {
  if (!Array.isArray(questions) || !questions.length || questions.length > 30) throw new Error('Invalid survey');
  const usedIds = new Set();
  return questions.map((question, index) => {
    if (!question || typeof question.text !== 'string' || !question.text.trim() || question.text.trim().length > 1000) throw new Error('Invalid survey');
    let id = typeof question.id === 'string' && /^q\d{1,3}$/.test(question.id) ? question.id : `q${index + 1}`;
    let candidate = index + 1;
    while (usedIds.has(id)) {
      id = `q${candidate}`;
      candidate += 1;
    }
    usedIds.add(id);
    return { id, number: index + 1, text: question.text.trim() };
  });
}

export async function getAdminSurveys(sort = 'title', direction = 'asc') {
  await requirePermission('surveys');
  if (isMockMode()) {
    return [{ id: surveyId, title: 'Medlemsundersøkelse om Kristnatten', is_open: true, ends_on: surveyEndsOn, has_ended: false, question_version: surveyVersion, questions: surveyQuestions, response_count: 1, created_at: null, mock: true }];
  }
  const sql = getSql();
  const orderBy = sortColumns[sort] || sortColumns.title;
  const orderDirection = direction === 'desc' ? 'DESC' : 'ASC';
  const surveys = await sql.query(`
    SELECT s.id, s.title, s.is_open, s.ends_on, s.question_version, s.created_at,
      s.questions,
      COUNT(r.id)::int AS response_count
    FROM surveys s
    LEFT JOIN survey_responses r ON r.survey_id = s.id
    WHERE s.deleted_at IS NULL
    GROUP BY s.id, s.title, s.is_open, s.ends_on, s.question_version, s.created_at, s.questions
    ORDER BY ${orderBy} ${orderDirection}, s.id
  `);
  return surveys.map(withStatus);
}

export async function updateAdminSurvey(id, { title, isOpen, endsOn, questions }) {
  const user = await requirePermission('surveys');
  if (!/^[a-f0-9]{32}$/i.test(id)) throw new Error('Invalid survey ID');
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200 || typeof isOpen !== 'boolean' || !isValidSurveyEndDate(endsOn)) throw new Error('Invalid survey');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  const normalizedQuestions = normalizeQuestions(questions);
  const serializedQuestions = JSON.stringify(normalizedQuestions);
  const sql = getSql();
  const [survey] = await sql`
    UPDATE surveys SET title = ${title.trim()}, is_open = ${isOpen}, ends_on = ${endsOn}, questions = ${serializedQuestions}::jsonb,
      question_version = CASE WHEN questions IS DISTINCT FROM ${serializedQuestions}::jsonb THEN question_version + 1 ELSE question_version END,
      updated_at = NOW(), last_changed_by = ${user.email.toLowerCase()}
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id, title, is_open, ends_on, question_version, questions, created_at, updated_at
  `;
  if (!survey) throw new Error('Survey not found');
  return withStatus(survey);
}

export async function deleteAdminSurvey(id) {
  const user = await requirePermission('surveys');
  if (!/^[a-f0-9]{32}$/i.test(id)) throw new Error('Invalid survey ID');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  const sql = getSql();
  const [survey] = await sql`UPDATE surveys SET deleted_at = NOW(), is_open = FALSE, updated_at = NOW(), last_changed_by = ${user.email.toLowerCase()} WHERE id = ${id} AND deleted_at IS NULL RETURNING id`;
  if (!survey) throw new Error('Survey not found');
}

export async function createAdminSurvey({ title, isOpen, endsOn, questions }) {
  const user = await requirePermission('surveys');
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200 || typeof isOpen !== 'boolean' || !isValidSurveyEndDate(endsOn)) throw new Error('Invalid survey');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  const normalizedQuestions = normalizeQuestions(questions);
  const id = randomUUID().replaceAll('-', '');
  const sql = getSql();
  const [survey] = await sql`
    INSERT INTO surveys (id, title, is_open, ends_on, questions, last_changed_by) VALUES (${id}, ${title.trim()}, ${isOpen}, ${endsOn}, ${JSON.stringify(normalizedQuestions)}::jsonb, ${user.email.toLowerCase()})
    RETURNING id, title, is_open, ends_on, question_version, questions, created_at
  `;
  return withStatus(survey);
}
