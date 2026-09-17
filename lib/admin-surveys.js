import { getSql } from './db.js';
import { randomUUID } from 'node:crypto';
import { isMockMode } from './mock-store.js';
import { surveyEndsOn, surveyId, surveyVersion } from '../data/survey.js';
import { surveyQuestions } from '../data/survey.js';
import { requirePermission } from './admin-access.js';
import { isValidSurveyEndDate, normalizeSurveyEndDate, surveyHasEnded } from './survey-dates.js';
import { listSurveyAttachments } from './survey-files.js';
import { normalizeSurveyQuestions as normalizeQuestions } from './survey-questions.js';
import { copyContentFiles } from './content-copy.js';

const sortColumns = { title: 's.title', is_open: 's.is_open', ends_on: 's.ends_on', response_count: 'response_count', question_version: 's.question_version' };

function withStatus(survey) {
  const endsOn = normalizeSurveyEndDate(survey.ends_on);
  const attachments = Array.isArray(survey.attachments) ? survey.attachments.map((file) => ({
    ...file, size_bytes: Number(file.size_bytes), url: file.url || `/api/survey/files/${file.id}`,
  })) : [];
  return { ...survey, attachments, ends_on: endsOn, has_ended: surveyHasEnded(endsOn) };
}

export async function getAdminSurveys(sort = 'title', direction = 'asc') {
  await requirePermission('surveys');
  if (isMockMode()) {
    return [{ id: surveyId, title: 'Medlemsundersøkelse om Kristnatten', is_open: true, ends_on: surveyEndsOn, has_ended: false, question_version: surveyVersion, questions: surveyQuestions, attachments: [], response_count: 1, created_at: null, mock: true }];
  }
  const sql = getSql();
  const orderBy = sortColumns[sort] || sortColumns.title;
  const orderDirection = direction === 'desc' ? 'DESC' : 'ASC';
  const surveys = await sql.query(`
    SELECT s.id, s.title, s.is_open, s.ends_on, s.question_version, s.created_at,
      s.questions,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'title', a.title, 'original_filename', a.original_filename,
        'mime_type', a.mime_type, 'size_bytes', a.size_bytes, 'sort_order', a.sort_order
      ) ORDER BY a.sort_order, a.created_at, a.id)
      FROM survey_attachments a WHERE a.survey_id = s.id AND a.deleted_at IS NULL), '[]'::jsonb) AS attachments,
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
  return withStatus({ ...survey, attachments: await listSurveyAttachments(sql, survey.id) });
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
  return withStatus({ ...survey, attachments: [] });
}

export async function copyAdminSurvey(sourceId) {
  const user = await requirePermission('surveys');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  if (!/^[a-f0-9]{32}$/i.test(sourceId || '')) throw new Error('Invalid survey ID');
  const sql = getSql();
  const [source] = await sql`SELECT id, title, questions, ends_on, single_response_per_property FROM surveys WHERE id = ${sourceId} AND deleted_at IS NULL`;
  if (!source) throw new Error('Survey not found');
  const files = await sql`SELECT title, original_filename, storage_key, mime_type, size_bytes, sort_order FROM survey_attachments WHERE survey_id = ${sourceId} AND deleted_at IS NULL ORDER BY sort_order, id`;
  const id = randomUUID().replaceAll('-', '');
  const actor = user.email.toLowerCase();
  const result = await copyContentFiles(files, `surveys/${id}/attachments`, (copies) => sql.transaction([
    sql`INSERT INTO surveys (id, title, questions, ends_on, is_open, single_response_per_property, last_changed_by)
      VALUES (${id}, ${`Kopi av ${source.title}`.slice(0, 200)}, ${JSON.stringify(source.questions)}::jsonb, ${normalizeSurveyEndDate(source.ends_on)}, FALSE, ${source.single_response_per_property}, ${actor}) RETURNING *`,
    ...copies.map((file) => sql`INSERT INTO survey_attachments (id, survey_id, title, original_filename, storage_key, mime_type, size_bytes, sort_order, last_changed_by)
      VALUES (${file.id}, ${id}, ${file.title}, ${file.original_filename}, ${file.storage_key}, ${file.mime_type}, ${file.size_bytes}, ${file.sort_order}, ${actor})`),
  ]));
  return withStatus({ ...result[0][0], response_count: 0, attachments: await listSurveyAttachments(sql, id) });
}
