import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '../helpers/postgres.mjs';
import { memberTestEnvironment as env } from '../helpers/member-service.mjs';
import { createAccessSecret, hashAccessSecret } from '../../lib/member-self-service-utils.js';
import { exchangeSurveyAccessToken, getSurveyAccess, submitSurveyResponse } from '../../lib/membership.js';

const db = createTestDatabase();
before(async () => db.migrate());
after(async () => db.close());
const id = () => randomUUID().replaceAll('-', '');
const questions = [{ id: 'q1', number: 1, text: 'Dag?', multiple: true, options: [{ value: 'o1', label: 'Mandag' }, { value: 'o2', label: 'Tirsdag' }] }];
async function fixture(single = true) {
  const surveyId = id();
  const emails = [`${id()}@example.test`, `${id()}@example.test`];
  const [member] = await db.sql`INSERT INTO members (h_number, primary_contact_email, other_contact_emails) VALUES (${id()}, ${emails[0]}, ${[emails[1]]}::text[]) RETURNING id`;
  await db.sql`INSERT INTO surveys (id, title, ends_on, questions, single_response_per_property)
    VALUES (${surveyId}, 'Synthetic', '2099-12-31', ${JSON.stringify(questions)}::jsonb, ${single})`;
  const sessions = [];
  for (const email of emails) {
    const secret = createAccessSecret();
    await db.sql`INSERT INTO survey_access_tokens (id, member_id, survey_id, recipient_email, token_hash, environment, audience, expires_at)
      VALUES (${id()}, ${member.id}, ${surveyId}, ${email}, ${hashAccessSecret(secret)}, ${env.APP_ENVIRONMENT}, ${env.TOKEN_AUDIENCE}, NOW() + INTERVAL '1 day')`;
    sessions.push(await exchangeSurveyAccessToken(secret, { sql: db.sql, env }));
  }
  return { surveyId, memberId: member.id, sessions, emails };
}

test('concurrent recipients produce one effective response and one primary receipt per submission', async () => {
  const f = await fixture();
  const results = await Promise.all(f.sessions.map((session, index) => submitSurveyResponse(session.secret, { q1: [index ? 'o2' : 'o1'] }, { sql: db.sql, env, questionVersion: 1 })));
  assert.deepEqual(results.map((result) => result.saved), [true, true]);
  assert.equal(results.filter((result) => result.accepted).length, 1);
  const rows = await db.sql`SELECT * FROM survey_responses WHERE survey_id = ${f.surveyId}`;
  assert.equal(rows.length, 1); assert.deepEqual(rows[0].questions, questions);
  const receipts = await db.sql`SELECT * FROM survey_response_receipts WHERE survey_id = ${f.surveyId}`;
  assert.equal(receipts.length, 2); assert.equal(receipts.filter((row) => row.accepted).length, 1);
  assert.ok(receipts.every((row) => row.recipient_email === f.emails[0] && row.response_id === rows[0].id));
  const events = await db.sql`SELECT result, metadata FROM security_events
    WHERE survey_id = ${f.surveyId} AND event_type = 'survey_response_submitted' ORDER BY id`;
  assert.equal(events.length, 2);
  assert.deepEqual(new Set(events.map((event) => event.result)), new Set(['accepted', 'already_answered']));
  assert.ok(events.every((event) => event.metadata.environment === env.APP_ENVIRONMENT && event.metadata.audience === env.TOKEN_AUDIENCE));
  assert.equal((await submitSurveyResponse(f.sessions[0].secret, { q1: ['o2'] }, { sql: db.sql, env, questionVersion: 1 })).saved, false);
  assert.equal((await db.sql`SELECT id FROM security_events
    WHERE survey_id = ${f.surveyId} AND event_type = 'survey_response_submitted'`).length, 2);
});

test('late main-email submission is acknowledged but cannot replace the earlier secondary-email answer', async () => {
  const f = await fixture();
  assert.equal((await submitSurveyResponse(f.sessions[1].secret, { q1: ['o2'] }, { sql: db.sql, env, questionVersion: 1 })).accepted, true);
  assert.equal((await getSurveyAccess(f.sessions[0].secret, { sql: db.sql, env })).status, 'ready');
  assert.equal((await submitSurveyResponse(f.sessions[0].secret, { q1: ['o1'] }, { sql: db.sql, env, questionVersion: 1 })).accepted, false);
  const [winner] = await db.sql`SELECT answers, respondent_email FROM survey_responses WHERE survey_id = ${f.surveyId}`;
  assert.deepEqual(winner.answers, { q1: ['o2'] }); assert.equal(winner.respondent_email, f.emails[1]);
});

test('independent mode counts both recipient answers and survives repeat migration', async () => {
  const f = await fixture(false);
  const results = await Promise.all(f.sessions.map((session) => submitSurveyResponse(session.secret, { q1: ['o1', 'o2'] }, { sql: db.sql, env, questionVersion: 1 })));
  assert.ok(results.every((result) => result.accepted));
  await db.migrate();
  assert.equal((await db.sql`SELECT id FROM survey_responses WHERE survey_id = ${f.surveyId}`).length, 2);
});

test('invalid multi-select values and changed versions cannot consume sessions or write receipts', async () => {
  const f = await fixture();
  const session = f.sessions[0];
  assert.equal((await submitSurveyResponse(session.secret, { q1: ['invalid'] }, { sql: db.sql, env, questionVersion: 1 })).saved, false);
  assert.equal((await submitSurveyResponse(session.secret, { q1: ['o1'] }, { sql: db.sql, env, questionVersion: 2 })).saved, false);
  assert.equal((await getSurveyAccess(session.secret, { sql: db.sql, env })).status, 'ready');
  assert.equal((await db.sql`SELECT id FROM survey_response_receipts WHERE survey_id = ${f.surveyId}`).length, 0);
});

test('an invitation can create a fresh session after the previous short-lived session expires', async () => {
  const surveyId = id();
  const email = `${id()}@example.test`;
  const invitationSecret = createAccessSecret();
  const [member] = await db.sql`INSERT INTO members (h_number, primary_contact_email)
    VALUES (${id()}, ${email}) RETURNING id`;
  await db.sql`INSERT INTO surveys (id, title, ends_on, questions)
    VALUES (${surveyId}, 'Synthetic', '2099-12-31', ${JSON.stringify(questions)}::jsonb)`;
  await db.sql`INSERT INTO survey_access_tokens (id, member_id, survey_id, recipient_email, token_hash, environment, audience, expires_at)
    VALUES (${id()}, ${member.id}, ${surveyId}, ${email}, ${hashAccessSecret(invitationSecret)}, ${env.APP_ENVIRONMENT}, ${env.TOKEN_AUDIENCE}, NOW() + INTERVAL '1 day')`;

  const first = await exchangeSurveyAccessToken(invitationSecret, { sql: db.sql, env });
  await db.sql`UPDATE survey_sessions SET expires_at = NOW() - INTERVAL '1 second' WHERE session_token_hash = ${hashAccessSecret(first.secret)}`;
  assert.equal((await getSurveyAccess(first.secret, { sql: db.sql, env })).status, 'not-found');

  const second = await exchangeSurveyAccessToken(invitationSecret, { sql: db.sql, env });
  assert.ok(second);
  assert.notEqual(second.secret, first.secret);
  assert.equal((await getSurveyAccess(second.secret, { sql: db.sql, env })).status, 'ready');
  assert.equal((await submitSurveyResponse(second.secret, { q1: ['o1'] }, { sql: db.sql, env, questionVersion: 1 })).saved, true);
  assert.equal(await exchangeSurveyAccessToken(invitationSecret, { sql: db.sql, env }), null);
});
