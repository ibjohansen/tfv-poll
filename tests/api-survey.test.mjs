import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, request } from './helpers/load-module.mjs';
import { surveySessionCookieName, surveySessionCookieOptions } from '../lib/membership.js';

async function setup() {
  const state = { limited: false, status: 'ready', saved: true, accepted: true, questions: null, writes: [], mock: false, secret: 'a'.repeat(64), error: null };
  const access = async () => {
    if (state.error) throw state.error;
    return { status: state.status, message: 'Tilgang kreves', survey: { question_version: 2, questions: state.questions || [{ id: 'q1', text: 'Spørsmål 1' }, { id: 'q2', text: 'Spørsmål 2' }] } };
  };
  const route = await loadModule('app/survey/api/responses/route.js', {
    'next/headers': { cookies: async () => ({ get: () => state.secret ? { value: state.secret } : undefined }) },
    '@/lib/mock-store': { isMockMode: () => state.mock },
    '@/lib/rate-limit': { isRateLimited: () => state.limited },
    '@/lib/survey-email-background': { isSurveyEmailBackgroundConfigured: () => false, dispatchSurveyReceipts: () => { throw new Error('Unexpected email dispatch'); } },
    '@/lib/membership': {
      surveySessionCookieName, getSurveyAccess: access, getMockSurveyAccess: access,
      submitSurveyResponse: async (...args) => { state.writes.push(args); return { saved: state.saved, accepted: state.accepted }; },
      submitMockSurveyResponse: async (...args) => { state.writes.push(args); return { saved: state.saved }; },
    },
  });
  return { route, state };
}

test('survey responses require one allowed answer per question and write only against the session', async () => {
  const { route, state } = await setup();
  const send = body => route.POST(request('/survey/api/responses', { method: 'POST', body: body && !Array.isArray(body) ? { questionVersion: 2, ...body } : body }));
  for (const body of [null, [], {}, { answers: [] }, { answers: { q1: 'ja' } }, { answers: { q1: 'yes', q2: 'nei' } }, { answers: { q1: 'ja', q2: 'nei', extra: 'usikker' } }]) assert.equal((await send(body)).status, 400);
  assert.equal(state.writes.length, 0);
  for (const answer of ['ja', 'nei', 'usikker']) {
    const response = await send({ answers: { q1: answer, q2: 'usikker' }, memberId: 'attacker-selected-member' });
    assert.equal(response.status, 201);
    assert.equal(state.writes.at(-1)[0], state.secret);
    assert.deepEqual(state.writes.at(-1)[1], { q1: answer, q2: 'usikker' });
    assert.equal(state.writes.at(-1)[2].questionVersion, 2);
    assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  }
});

test('survey API validates custom multiple choices and reports a later non-counted response', async () => {
  const { route, state } = await setup();
  state.questions = [{ id: 'q1', text: 'Aktiviteter', multiple: true, options: [{ value: 'ski', label: 'Ski' }, { value: 'walk', label: 'Tur' }] }];
  const send = (answer) => route.POST(request('/survey/api/responses', { method: 'POST', body: { questionVersion: 2, answers: { q1: answer } } }));
  for (const value of ['ski', [], ['unknown'], ['ski', 'ski']]) assert.equal((await send(value)).status, 400);
  assert.equal(state.writes.length, 0);
  state.accepted = false;
  const response = await send(['ski', 'walk']);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).accepted, false);
  assert.deepEqual(state.writes.at(-1)[1], { q1: ['ski', 'walk'] });
});

test('survey origin, throttling, expired sessions, closed surveys and duplicates prevent writes', async () => {
  const { route, state } = await setup();
  const send = headers => route.POST(request('/survey/api/responses', { method: 'POST', headers, body: { questionVersion: 2, answers: { q1: 'ja', q2: 'nei' } } }));
  assert.equal((await send({ origin: 'https://evil.test' })).status, 403);
  state.limited = true;
  assert.equal((await send()).status, 429);
  state.limited = false;
  for (const [status, expected] of [['not-found', 403], ['ended', 410], ['answered', 409]]) {
    state.status = status;
    assert.equal((await send()).status, expected);
  }
  assert.equal(state.writes.length, 0);
  state.status = 'ready'; state.saved = false;
  assert.equal((await send()).status, 409);
  state.error = new Error('postgres://secret:password@db');
  const response = await send();
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /secret|password/);
});

test('survey honeypot reports success without persisting an answer', async () => {
  const { route, state } = await setup();
  const response = await route.POST(request('/survey/api/responses', { method: 'POST', body: { website: 'spam' } }));
  assert.equal(response.status, 200);
  assert.equal(state.writes.length, 0);
});

test('survey rejects a stale version even when question IDs and answers remain valid', async () => {
  const { route, state } = await setup();
  for (const [questionVersion, status] of [[undefined, 400], ['2', 400], [1.5, 400], [1, 409], [3, 409]]) {
    const response = await route.POST(request('/survey/api/responses', { method: 'POST', body: { questionVersion, answers: { q1: 'ja', q2: 'nei' } } }));
    assert.equal(response.status, status);
    if (status === 409) assert.equal((await response.json()).code, 'SURVEY_CHANGED');
  }
  assert.equal(state.writes.length, 0);
});

test('survey verification removes token from URL and clears cookies after replay or error', async () => {
  let session = { secret: 'b'.repeat(64), expires_at: new Date(Date.now() + 60000).toISOString() }, error;
  const route = await loadModule('app/api/survey-access/verify/route.js', {
    '@/lib/membership': { surveySessionCookieName, surveySessionCookieOptions, exchangeSurveyAccessToken: async () => { if (error) throw error; return session; } },
  });
  const send = () => route.GET(request(`/api/survey-access/verify?token=${'a'.repeat(64)}`));
  const ok = await send();
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get('location'), 'https://example.test/survey');
  assert.match(ok.headers.get('set-cookie'), /HttpOnly/);
  session = null;
  for (const cause of [null, new Error('secret')]) {
    error = cause;
    const failed = await send();
    assert.equal(failed.status, 303);
    assert.match(failed.headers.get('location'), /status=invalid/);
    assert.match(failed.headers.get('set-cookie'), /Max-Age=0/);
    assert.match(failed.headers.get('cache-control'), /no-store/);
  }
});
