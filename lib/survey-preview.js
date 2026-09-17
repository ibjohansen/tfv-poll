import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSql } from './db.js';
import { normalizeSurveyEndDate } from './survey-dates.js';
import { normalizeSurveyQuestions } from './survey-questions.js';
import { assertDatabaseEnvironment, getSecurityContext } from './security-config.js';

const SURVEY_ID_PATTERN = /^[a-f0-9]{32}$/i;
const PREVIEW_TOKEN_TTL_SECONDS = 24 * 60 * 60;
const CLOCK_SKEW_SECONDS = 60;
const TOKEN_PURPOSE = 'survey-preview.v1';

function epochSeconds(now) {
  const timestamp = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(timestamp)) throw new Error('Invalid preview time');
  return Math.floor(timestamp / 1000);
}

function signature(encodedPayload, hmacKey) {
  return createHmac('sha256', hmacKey)
    .update(`${TOKEN_PURPOSE}.${encodedPayload}`, 'utf8')
    .digest();
}

export function createSurveyPreviewToken({ surveyId, questionVersion }, env = process.env, now = Date.now()) {
  if (!SURVEY_ID_PATTERN.test(surveyId || '') || !Number.isSafeInteger(questionVersion) || questionVersion < 1) {
    throw new Error('Invalid survey preview');
  }
  const context = getSecurityContext(env);
  const issuedAt = epochSeconds(now);
  const payload = {
    v: 1,
    sid: surveyId.toLowerCase(),
    qv: questionVersion,
    iat: issuedAt,
    exp: issuedAt + PREVIEW_TOKEN_TTL_SECONDS,
    env: context.environment,
    aud: context.audience,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encodedPayload}.${signature(encodedPayload, context.hmacKey).toString('base64url')}`;
}

export function verifySurveyPreviewToken(token, env = process.env, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return null;
  try {
    const context = getSecurityContext(env);
    const receivedSignature = Buffer.from(parts[1], 'base64url');
    const expectedSignature = signature(parts[0], context.hmacKey);
    if (receivedSignature.length !== expectedSignature.length || !timingSafeEqual(receivedSignature, expectedSignature)) return null;
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const currentTime = epochSeconds(now);
    if (!payload || payload.v !== 1 || !SURVEY_ID_PATTERN.test(payload.sid || '')
      || !Number.isSafeInteger(payload.qv) || payload.qv < 1
      || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
      || payload.iat > currentTime + CLOCK_SKEW_SECONDS || payload.exp <= currentTime
      || payload.exp - payload.iat > PREVIEW_TOKEN_TTL_SECONDS
      || payload.env !== context.environment || payload.aud !== context.audience) return null;
    return { surveyId: payload.sid.toLowerCase(), questionVersion: payload.qv, expiresAt: new Date(payload.exp * 1000) };
  } catch {
    return null;
  }
}

export function buildSurveyPreviewUrl({ baseUrl, token }, env = process.env) {
  if (!verifySurveyPreviewToken(token, env)) throw new Error('Invalid survey preview');
  const url = new URL('/survey', baseUrl);
  url.searchParams.set('preview', token);
  return url.toString();
}

export async function getSurveyPreview(token, options = {}) {
  const env = options.env || process.env;
  const preview = verifySurveyPreviewToken(token, env, options.now ?? Date.now());
  if (!preview) return null;
  const sql = options.sql || getSql();
  await assertDatabaseEnvironment(sql, env);
  const [survey] = await sql`
    SELECT id, title, ends_on, question_version, questions, single_response_per_property
    FROM surveys
    WHERE id = ${preview.surveyId} AND deleted_at IS NULL
  `;
  if (!survey || Number(survey.question_version) !== preview.questionVersion) return null;
  const endsOn = normalizeSurveyEndDate(survey.ends_on);
  if (!endsOn) return null;
  let questions;
  try { questions = normalizeSurveyQuestions(survey.questions); }
  catch { return null; }
  const attachments = await sql`
    SELECT id, title, original_filename, mime_type, size_bytes, sort_order
    FROM survey_attachments
    WHERE survey_id = ${survey.id} AND deleted_at IS NULL
    ORDER BY sort_order, created_at, id
  `;
  return {
    id: survey.id,
    title: survey.title,
    ends_on: endsOn,
    question_version: Number(survey.question_version),
    questions,
    single_response_per_property: survey.single_response_per_property,
    attachments: attachments.map((file) => ({
      id: file.id,
      title: file.title,
      original_filename: file.original_filename,
      mime_type: file.mime_type,
      size_bytes: Number(file.size_bytes),
      url: `/api/survey/files/${file.id}?preview=${encodeURIComponent(token)}`,
    })),
  };
}
