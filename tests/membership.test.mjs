import test from 'node:test';
import assert from 'node:assert/strict';
import { getMemberAccess, validateAccess } from '../lib/membership.js';
import { surveyId } from '../data/survey.js';

const token = 'abcdef0123456789abcdef0123456789';
const activeSurvey = { id: surveyId, ends_on: '2099-12-31' };

test('missing and malformed tokens and survey IDs are rejected before database access', async () => {
  const db = () => { throw new Error('Should not query'); };
  for (const value of [undefined, null, '']) {
    assert.equal((await getMemberAccess(value, surveyId, db)).status, 'missing');
  }
  for (const value of ['abc123', 'g'.repeat(32), `${token} `, [token, token], {}, 123]) {
    assert.equal((await getMemberAccess(value, surveyId, db)).status, 'invalid');
  }
  for (const value of [undefined, '', 'unknown', [surveyId, surveyId]]) {
    assert.equal((await getMemberAccess(token, value, db)).status, 'invalid-survey');
  }
});

test('unknown survey and unknown member have separate results', async () => {
  assert.equal((await getMemberAccess(token, surveyId, async () => [])).status, 'invalid-survey');
  let calls = 0;
  const db = async () => ++calls === 1 ? [activeSurvey] : [];
  assert.equal((await getMemberAccess(token, surveyId, db)).status, 'not-found');
});

test('valid link returns member data and normalizes uppercase tokens', async () => {
  const member = { id: '42', h_number: 'H-1', street_address: 'Testveien 1', primary_contact_email: 'test@example.com', other_contact_emails: ['test@example.com'], has_responded: false };
  let calls = 0;
  const db = async (strings, ...values) => {
    if (++calls === 1) return [activeSurvey];
    assert.deepEqual(values, [surveyId, token]);
    return [member];
  };
  const access = await getMemberAccess(token.toUpperCase(), surveyId, db);
  assert.equal(access.status, 'ready');
  assert.deepEqual(access.member, { id: '42', h_number: 'H-1', cadastral_number: undefined, section_number: undefined, street_address: 'Testveien 1', title_holder: undefined, registration_date: undefined, primary_contact_name: undefined, primary_contact_email: 'test@example.com', other_contact_emails: ['test@example.com'], has_responded: false });
  assert.equal(validateAccess(token, surveyId), null);
});

test('existing response blocks submission while retaining member information', async () => {
  let calls = 0;
  const member = { id: '42', h_number: 'H-1', has_responded: true };
  const db = async () => ++calls === 1 ? [activeSurvey] : [member];
  const access = await getMemberAccess(token, surveyId, db);
  assert.equal(access.status, 'answered');
  assert.deepEqual(access.member, { id: '42', h_number: 'H-1', cadastral_number: undefined, section_number: undefined, street_address: undefined, title_holder: undefined, registration_date: undefined, primary_contact_name: undefined, primary_contact_email: undefined, other_contact_emails: undefined, has_responded: true });
});

test('database failures do not become unknown-member results', async () => {
  await assert.rejects(getMemberAccess(token, surveyId, async () => { throw new Error('offline'); }), /offline/);
});

test('an ended survey stops before member lookup and has a distinct message', async () => {
  let calls = 0;
  const access = await getMemberAccess(token, surveyId, async () => {
    calls += 1;
    return [{ ...activeSurvey, is_open: false, ends_on: '2000-01-01' }];
  });
  assert.equal(calls, 1);
  assert.equal(access.status, 'ended');
  assert.match(access.message, /avsluttet/i);
});
