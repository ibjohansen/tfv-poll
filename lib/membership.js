import { isMockMode, findMockMember, saveMockResponse } from './mock-store.js';
import { getSql } from './db.js';
import { surveyEndsOn, surveyId as currentSurveyId, surveyQuestions, surveyVersion } from '../data/survey.js';
import { normalizeSurveyEndDate, surveyHasEnded } from './survey-dates.js';
import { createAccessSecret, hashAccessSecret, isAccessSecret, randomId } from './member-self-service-utils.js';
import { assertDatabaseEnvironment } from './security-config.js';
import { recordSecurityEvent } from './security-events.js';
import { storeSurveyResponse } from './survey-response-store.js';
import { hasValidSurveyAnswers } from './survey-questions.js';

export const SURVEY_SESSION_TTL_SECONDS = 45 * 60;
export const SURVEY_SESSION_ABSOLUTE_TTL_SECONDS = 4 * 60 * 60;

export function surveySessionCookieName(env = process.env) {
  return env.NODE_ENV === 'production' ? '__Host-tfv_survey_session' : 'tfv_survey_session';
}

export function surveySessionCookieOptions(expiresAt, env = process.env) {
  const expires = new Date(expiresAt);
  return {
    httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', path: '/', expires,
    maxAge: Math.max(0, Math.floor((expires.getTime() - Date.now()) / 1000)), priority: 'high',
  };
}

function invalidAccess() {
  return { status: 'not-found', message: 'Tilgangen er ugyldig eller utløpt. Åpne invitasjonslenken på nytt, eller be Turufjell Vel om en ny invitasjon hvis lenken ikke virker.' };
}

function publicMember(member) {
  return {
    id: member.id, h_number: member.h_number, cadastral_number: member.cadastral_number,
    section_number: member.section_number, street_address: member.street_address,
    has_responded: member.has_responded,
  };
}

function accessResult(member, survey) {
  if (surveyHasEnded(survey.ends_on)) {
    return { status: 'ended', survey, message: 'Undersøkelsen er avsluttet. Det er ikke lenger mulig å sende inn svar.' };
  }
  const exposedMember = publicMember(member);
  if (member.has_responded) {
    return { status: 'answered', member: exposedMember, survey, message: 'Det er allerede registrert en besvarelse for denne tomten i denne undersøkelsen. Skjemaet kan bare sendes inn én gang.' };
  }
  return { status: 'ready', member: exposedMember, survey, message: 'Tilgangen er gyldig. Kontroller tomteopplysningene nedenfor før du svarer.' };
}

export async function exchangeSurveyAccessToken(secret, options = {}) {
  if (!isAccessSecret(secret)) return null;
  const sql = options.sql || getSql();
  const env = options.env || process.env;
  const context = await assertDatabaseEnvironment(sql, env);
  const sessionSecret = createAccessSecret();
  const sessionId = randomId();
  const [session] = await sql`
    WITH authorized AS (
      UPDATE survey_access_tokens t SET consumed_at = COALESCE(t.consumed_at, NOW())
      WHERE t.token_hash = ${hashAccessSecret(secret)}
        AND t.answered_at IS NULL AND t.revoked_at IS NULL AND t.expires_at > NOW()
        AND t.environment = ${context.environment} AND t.audience = ${context.audience}
        AND EXISTS (
          SELECT 1 FROM members m JOIN surveys s ON s.id = t.survey_id
          WHERE m.id = t.member_id AND m.deleted_at IS NULL AND m.membership_status = 'member' AND s.deleted_at IS NULL
            AND s.is_open = TRUE AND s.ends_on >= (NOW() AT TIME ZONE 'Europe/Oslo')::date
            AND COALESCE(t.recipient_email, NULLIF(btrim(m.primary_contact_email), '')) IS NOT NULL
            AND (t.recipient_email IS NULL OR t.recipient_email = lower(btrim(m.primary_contact_email))
              OR EXISTS (SELECT 1 FROM unnest(m.other_contact_emails) e WHERE lower(btrim(e)) = t.recipient_email))
        )
      RETURNING t.id, t.member_id, t.survey_id, t.recipient_email
    ), created AS (
      INSERT INTO survey_sessions (
        id, member_id, survey_id, recipient_email, session_token_hash, environment, audience, expires_at, absolute_expires_at
      )
      SELECT ${sessionId}, c.member_id, c.survey_id, c.recipient_email, ${hashAccessSecret(sessionSecret)},
        ${context.environment}, ${context.audience},
        LEAST(NOW() + (${SURVEY_SESSION_TTL_SECONDS} * INTERVAL '1 second'),
          ((s.ends_on + 1)::timestamp AT TIME ZONE 'Europe/Oslo')),
        LEAST(NOW() + (${SURVEY_SESSION_ABSOLUTE_TTL_SECONDS} * INTERVAL '1 second'),
          ((s.ends_on + 1)::timestamp AT TIME ZONE 'Europe/Oslo'))
      FROM authorized c JOIN surveys s ON s.id = c.survey_id
      RETURNING member_id, survey_id, expires_at
    )
    SELECT member_id, survey_id, expires_at FROM created
  `;
  await recordSecurityEvent(sql, {
    eventType: 'survey_access_token_consumed', actorType: 'public', result: session ? 'accepted' : 'rejected',
    memberId: session?.member_id, surveyId: session?.survey_id, entityId: session ? sessionId : null,
    key: 'survey-access-attempt', metadata: { environment: context.environment, audience: context.audience },
  }, env);
  return session ? { ...session, secret: sessionSecret } : null;
}

export async function getSurveyAccess(secret, options = {}) {
  if (!isAccessSecret(secret)) return invalidAccess();
  const sql = options.sql || getSql();
  const env = options.env || process.env;
  const context = await assertDatabaseEnvironment(sql, env);
  const [row] = await sql`
    WITH valid_session AS (
      UPDATE survey_sessions SET last_seen_at = NOW(),
        expires_at = LEAST(absolute_expires_at, NOW() + (${SURVEY_SESSION_TTL_SECONDS} * INTERVAL '1 second'))
      WHERE session_token_hash = ${hashAccessSecret(secret)} AND revoked_at IS NULL
        AND answered_at IS NULL AND expires_at > NOW() AND absolute_expires_at > NOW()
        AND environment = ${context.environment} AND audience = ${context.audience}
      RETURNING member_id, survey_id, recipient_email
    )
    SELECT m.id, m.h_number, m.cadastral_number, m.section_number, m.street_address,
      EXISTS (SELECT 1 FROM survey_responses r WHERE r.member_id = m.id AND r.survey_id = s.id
        AND (r.respondent_email IS NULL OR r.respondent_email = COALESCE(session.recipient_email, lower(btrim(m.primary_contact_email))))) AS has_responded,
      s.id AS survey_id, s.is_open, s.ends_on, s.question_version, s.questions, s.single_response_per_property
    FROM valid_session session
    JOIN members m ON m.id = session.member_id
    JOIN surveys s ON s.id = session.survey_id
    WHERE m.deleted_at IS NULL AND m.membership_status = 'member' AND s.deleted_at IS NULL AND s.is_open = TRUE
      AND COALESCE(session.recipient_email, NULLIF(btrim(m.primary_contact_email), '')) IS NOT NULL
      AND (session.recipient_email IS NULL OR session.recipient_email = lower(btrim(m.primary_contact_email))
        OR EXISTS (SELECT 1 FROM unnest(m.other_contact_emails) e WHERE lower(btrim(e)) = session.recipient_email))
  `;
  if (!row) return invalidAccess();
  const endsOn = normalizeSurveyEndDate(row.ends_on);
  if (!endsOn || !Array.isArray(row.questions) || !row.questions.length) return invalidAccess();
  const attachments = await sql`
    SELECT id, title, original_filename, mime_type, size_bytes, sort_order
    FROM survey_attachments
    WHERE survey_id = ${row.survey_id} AND deleted_at IS NULL
    ORDER BY sort_order, created_at, id
  `;
  return accessResult(row, {
    id: row.survey_id, is_open: row.is_open, ends_on: endsOn,
    question_version: row.question_version, questions: row.questions, single_response_per_property: row.single_response_per_property,
    attachments: attachments.map((file) => ({
      id: file.id, title: file.title, original_filename: file.original_filename,
      mime_type: file.mime_type, size_bytes: Number(file.size_bytes),
      url: `/api/survey/files/${file.id}`,
    })),
  });
}

export async function submitSurveyResponse(secret, answers, options = {}) {
  const questionVersion = options.questionVersion;
  if (!Number.isSafeInteger(questionVersion) || questionVersion < 1 || questionVersion > 2147483647) throw new Error('Invalid survey version');
  const access = await getSurveyAccess(secret, options);
  if (access.status !== 'ready') return { access, saved: false };
  if (access.survey.question_version !== questionVersion) return { access, saved: false };
  if (!hasValidSurveyAnswers(answers, access.survey.questions)) return { access, saved: false };
  const sql = options.sql || getSql();
  const env = options.env || process.env;
  const context = await assertDatabaseEnvironment(sql, env);
  const saved = await storeSurveyResponse(sql, { sessionHash: hashAccessSecret(secret), ...context, questionVersion, answers });
  return { access, saved: Boolean(saved), accepted: saved?.accepted, receiptId: saved?.id };
}

// Kun syntetisk mockmodus. Produksjonsflyten bruker alltid hash-lagret session.
export async function getMockSurveyAccess(memberToken, surveyId) {
  if (!isMockMode() || !/^[a-f0-9]{32}$/i.test(memberToken || '') || surveyId !== currentSurveyId) return invalidAccess();
  const member = await findMockMember(memberToken.toLowerCase(), surveyId);
  if (!member) return invalidAccess();
  return accessResult(member, {
    id: surveyId, is_open: true, ends_on: surveyEndsOn,
    question_version: surveyVersion, questions: surveyQuestions, attachments: [],
  });
}

export async function submitMockSurveyResponse(memberToken, surveyId, answers) {
  const access = await getMockSurveyAccess(memberToken, surveyId);
  if (access.status !== 'ready') return { access, saved: false };
  return { access, saved: await saveMockResponse(access.member.id, surveyId, answers) };
}
