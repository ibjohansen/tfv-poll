import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getMockSurveyAccess } from '../lib/membership.js';
import { saveMockResponse, isMockMode } from '../lib/mock-store.js';
import { surveyId } from '../data/survey.js';

test('mock flow works without a database and prevents concurrent duplicate answers', async () => {
  const previous = { ...process.env };
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tfv-mock-test-'));
  process.env.MOCK_DATA_DIR = directory;
  process.env.MOCK_DATA = 'true';
  process.env.NODE_ENV = 'test';
  delete process.env.DATABASE_URL;
  try {
    const token = '1'.repeat(32);
    assert.equal((await getMockSurveyAccess(token, surveyId)).status, 'ready');
    assert.equal((await getMockSurveyAccess('2'.repeat(32), surveyId)).status, 'answered');
    assert.equal((await getMockSurveyAccess('3'.repeat(32), surveyId)).member.primary_contact_email, undefined);
    assert.equal((await getMockSurveyAccess('f'.repeat(32), surveyId)).status, 'not-found');
    await assert.rejects(getMockSurveyAccess('d'.repeat(32), surveyId), /Simulert/);
    const answers = {q1: 'ja', q2: 'nei', q3: 'usikker', q4: 'ja'};
    const attempts = await Promise.all(Array.from({length: 10}, () => saveMockResponse('1', surveyId, answers)));
    assert.equal(attempts.filter(Boolean).length, 1);
    assert.equal((await getMockSurveyAccess(token, surveyId)).status, 'answered');
    assert.equal(await saveMockResponse('2', surveyId, answers), false);
    process.env.NODE_ENV = 'production';
    assert.equal(isMockMode(), false);
    process.env.NODE_ENV = 'test';
    process.env.MOCK_DATA = 'false';
    assert.equal(isMockMode(), false);
  } finally {
    process.env = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
