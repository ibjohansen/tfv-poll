import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidSurveyEndDate, normalizeSurveyEndDate, osloDateKey, surveyHasEnded } from '../lib/survey-dates.js';

test('survey end dates must be real ISO calendar dates', () => {
  assert.equal(isValidSurveyEndDate('2028-02-29'), true);
  for (const value of ['', '2027-02-29', '2026-2-01', '01.02.2026', null]) {
    assert.equal(isValidSurveyEndDate(value), false, String(value));
  }
});

test('the end date is inclusive in Europe/Oslo', () => {
  const duringEndDate = new Date('2026-09-08T21:59:59Z');
  const afterEndDate = new Date('2026-09-08T22:00:00Z');
  assert.equal(osloDateKey(duringEndDate), '2026-09-08');
  assert.equal(osloDateKey(afterEndDate), '2026-09-09');
  assert.equal(surveyHasEnded('2026-09-08', duringEndDate), false);
  assert.equal(surveyHasEnded('2026-09-08', afterEndDate), true);
});

test('Postgres DATE objects are normalized before reaching client components', () => {
  const databaseDate = new Date('2026-09-08T00:00:00.000Z');
  assert.equal(normalizeSurveyEndDate(databaseDate), '2026-09-08');
  assert.equal(normalizeSurveyEndDate(new Date('invalid')), '');
  assert.equal(surveyHasEnded(databaseDate, new Date('2026-09-08T22:00:00Z')), true);
});
