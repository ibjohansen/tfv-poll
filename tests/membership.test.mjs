import test from 'node:test';
import assert from 'node:assert/strict';
import { exchangeSurveyAccessToken, getSurveyAccess, submitSurveyResponse } from '../lib/membership.js';

const secret = 'a'.repeat(64);
const env = {
  APP_ENVIRONMENT: 'development', TOKEN_AUDIENCE: 'tfv-test',
  SECURITY_EVENT_HMAC_KEY: 'a-development-test-key-with-32-bytes',
};

function sqlMock(rows, statements = []) {
  return async (strings) => {
    const query = strings.join('?');
    statements.push(query);
    if (query.includes('application_environment')) return [{ environment: 'development' }];
    if (query.includes('INSERT INTO security_events')) return [];
    return rows.shift() || [];
  };
}

test('missing and malformed survey session secrets are rejected before database access', async () => {
  const sql = () => { throw new Error('Should not query'); };
  for (const value of [undefined, null, '', 'abc123', 'g'.repeat(64), `${secret} `, {}, 123]) {
    assert.equal((await getSurveyAccess(value, { sql, env })).status, 'not-found');
  }
});

test('valid survey session returns only minimal property data', async () => {
  const row = {
    id: '42', h_number: 'H-1', cadastral_number: '10/20', section_number: '3',
    street_address: 'Testveien 1', title_holder: 'Skal ikke ut', primary_contact_email: 'secret@example.no',
    has_responded: false, survey_id: 'b'.repeat(32), is_open: true, ends_on: '2099-12-31',
    question_version: 2, questions: [{ id: 'q1', text: 'Spørsmål' }],
  };
  const access = await getSurveyAccess(secret, { sql: sqlMock([[row]]), env });
  assert.equal(access.status, 'ready');
  assert.deepEqual(access.member, {
    id: '42', h_number: 'H-1', cadastral_number: '10/20', section_number: '3',
    street_address: 'Testveien 1', has_responded: false,
  });
  assert.equal(access.member.primary_contact_email, undefined);
  assert.equal(access.member.title_holder, undefined);
});

test('ended survey is rejected without exposing the member', async () => {
  const row = {
    id: '42', h_number: 'H-1', has_responded: false, survey_id: 'b'.repeat(32),
    is_open: true, ends_on: '2000-01-01', question_version: 1,
    questions: [{ id: 'q1', text: 'Spørsmål' }],
  };
  const access = await getSurveyAccess(secret, { sql: sqlMock([[row]]), env });
  assert.equal(access.status, 'ended');
  assert.equal(access.member, undefined);
});

test('one-time survey token is consumed while creating a separate hashed session', async () => {
  const statements = [];
  const sql = sqlMock([[{ member_id: '42', survey_id: 'b'.repeat(32), expires_at: '2099-01-01' }]], statements);
  const session = await exchangeSurveyAccessToken(secret, { sql, env });
  assert.equal(session.member_id, '42');
  assert.match(session.secret, /^[a-f0-9]{64}$/);
  assert.notEqual(session.secret, secret);
  assert.match(statements.join('\n'), /consumed_at IS NULL/);
  assert.match(statements.join('\n'), /session_token_hash/);
});

test('database environment mismatch fails closed', async () => {
  const sql = async () => [{ environment: 'production' }];
  await assert.rejects(getSurveyAccess(secret, { sql, env }), /Database environment mismatch/);
});

test('survey submission requires the displayed version before any response write', async () => {
  const row = {
    id: '42', survey_id: 'b'.repeat(32), is_open: true, ends_on: '2099-12-31',
    question_version: 2, questions: [{ id: 'q1', text: 'Ny spørsmålstekst' }],
  };
  const statements = [];
  await assert.rejects(submitSurveyResponse(secret, { q1: 'ja' }, { sql: sqlMock([], statements), env }), /Invalid survey version/);
  assert.equal(statements.length, 0);
  const result = await submitSurveyResponse(secret, { q1: 'ja' }, { sql: sqlMock([[row]], statements), env, questionVersion: 1 });
  assert.equal(result.saved, false);
  assert.equal(statements.some(query => query.includes('INSERT INTO survey_responses')), false);
});

test('response snapshot and version condition are part of the same insert statement', async () => {
  const queries = [];
  const sql = async (strings, ...values) => {
    const query = strings.join('?');
    queries.push({ query, values });
    if (query.includes('application_environment')) return [{ environment: 'development' }];
    if (query.includes('INSERT INTO security_events')) return [];
    if (query.includes('INSERT INTO survey_responses')) return [{ id: '1', member_id: '42', survey_id: 'b'.repeat(32) }];
    return [{ id: '42', survey_id: 'b'.repeat(32), is_open: true, ends_on: '2099-12-31', question_version: 2, questions: [{ id: 'q1', text: 'Spørsmål' }] }];
  };
  assert.equal((await submitSurveyResponse(secret, { q1: 'ja' }, { sql, env, questionVersion: 2 })).saved, true);
  const insert = queries.find(({ query }) => query.includes('INSERT INTO survey_responses'));
  assert.match(insert.query, /respondent_email, id, question_version, questions/);
  assert.match(insert.query, /ON CONFLICT \(member_id, survey_id, response_key\) DO UPDATE SET response_key = EXCLUDED.response_key/);
  assert.match(insert.query, /INSERT INTO survey_response_receipts/);
  assert.match(insert.query, /AND s.question_version = \?/);
  assert.ok(insert.values.includes(2));
  assert.ok(insert.values.includes(JSON.stringify({ q1: 'ja' })));
  assert.doesNotMatch(JSON.stringify(queries), new RegExp(secret));
});
