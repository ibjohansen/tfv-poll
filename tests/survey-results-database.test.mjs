import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import ExcelJS from 'exceljs';
import { loadModule, plain } from './helpers/load-module.mjs';
import * as seed from '../data/survey.js';
import * as dates from '../lib/survey-dates.js';
import * as results from '../lib/survey-results.js';
import * as activity from '../lib/admin-activity.js';

// Local synthetic PostgreSQL only: no credentials, production data or network.
const db = new PGlite({ extensions: { pg_trgm } });
const sql = (strings, ...values) => db.query(strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, ''), values).then((result) => result.rows);
const id = 'a'.repeat(32);
const questions = [{ id: 'q1', number: 1, text: 'Opprinnelig spørsmål?' },
  { id: 'q2', number: 2, text: 'Flere valg?', multiple: true, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }];
let api, denied = false;

before(async () => {
  await db.exec(await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8'));
  api = await loadModule('lib/admin-survey-results.js', {
    './db.js': { getSql: () => sql }, './mock-store.js': { isMockMode: () => false },
    './admin-access.js': { requirePermission: async (permission) => {
      assert.equal(permission, 'surveys');
      if (denied) throw new Error('Forbidden');
      return { email: 'survey-admin@example.test' };
    } },
    '../data/survey.js': seed, './survey-dates.js': dates, './survey-results.js': results, './admin-activity.js': activity,
  });
  await sql`INSERT INTO surveys (id, title, ends_on, questions) VALUES (${id}, 'Syntetisk undersøkelse', '2026-12-31', ${JSON.stringify(questions)}::jsonb)`;
  await sql`INSERT INTO surveys (id, title, ends_on, questions) VALUES (${'b'.repeat(32)}, 'Annen undersøkelse', '2026-12-31', ${JSON.stringify(questions)}::jsonb)`;
  await db.exec(`INSERT INTO member_hamlets (id, name, deleted_at) VALUES (1, 'Grend A', NULL), (2, 'Grend B', NULL), (3, 'Tom grend', NULL), (4, 'Slettet grend', NOW());
    INSERT INTO members (id, h_number, hamlet_id, deleted_at) VALUES (1, 'H-test-1', 1, NULL), (2, 'H-test-2', 2, NULL), (3, 'H-test-3', NULL, NULL), (4, 'H-test-4', 4, NULL), (5, 'H-test-5', 1, NOW());`);
  for (const [member, responseKey, answer] of [[1, 'email:a', 'ja'], [1, 'email:b', 'nei'], [2, 'property', 'usikker'], [3, 'property', 'ja'], [4, 'property', 'nei'], [5, 'property', 'ja']]) {
    await sql`INSERT INTO survey_responses (survey_id, member_id, response_key, question_version, questions, answers)
      VALUES (${id}, ${member}, ${responseKey}, 1, ${JSON.stringify(questions)}::jsonb, ${JSON.stringify({ q1: answer, q2: ['a', 'b'] })}::jsonb)`;
  }
  await sql`INSERT INTO survey_responses (survey_id, member_id, question_version, questions, answers)
    VALUES (${'b'.repeat(32)}, 1, 1, ${JSON.stringify(questions)}::jsonb, '{"q1":"nei"}'::jsonb)`;
});
after(() => db.close());

test('hamlet filtering preserves effective email responses, historical question snapshots and deleted-member responses', async () => {
  const all = await api.getAdminSurveyResults(id);
  const a = await api.getAdminSurveyResults(id, '1');
  const b = await api.getAdminSurveyResults(id, '2');
  const none = await api.getAdminSurveyResults(id, 'none');
  assert.equal(all.response_count, 6);
  assert.equal(a.response_count, 3); assert.equal(b.response_count, 1); assert.equal(none.response_count, 2);
  assert.equal(a.response_count + b.response_count + none.response_count, all.response_count);
  assert.deepEqual(plain(a.hamlets.map((hamlet) => hamlet.id)), ['1', '2', '3']);
  assert.deepEqual(plain(a.versions[0].questions[0].counts), { ja: 2, nei: 1, usikker: 0 });
  assert.equal(a.versions[0].questions[0].text, questions[0].text);
  assert.deepEqual(plain(a.versions[0].questions[1].counts), { a: 3, b: 3 });
  assert.equal((await api.getAdminSurveyResults(id, '3')).response_count, 0);
  assert.ok(!JSON.stringify(all).includes('email:'));
});

test('filtered workbook and export audit agree with chart counts and do not expose member identities', async () => {
  const result = await api.createAdminSurveyResultsExport(id, '2');
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(result.buffer);
  assert.equal(result.count, 1);
  assert.equal(workbook.getWorksheet('Oppsummering').getCell('B4').value, 1);
  assert.equal(workbook.getWorksheet('Oppsummering').getCell('B5').value, 'Grend B');
  assert.equal(workbook.getWorksheet('Besvarelser').rowCount, 3);
  const [audit] = await sql`SELECT after_value FROM audit_log WHERE table_name = 'admin_actions' ORDER BY id DESC LIMIT 1`;
  assert.deepEqual(audit.after_value, { action: 'survey_results_export', count: 1, scope: 'selected', survey_id: id });
});

test('filter uses current hamlet assignment without rewriting response snapshots', async () => {
  const before = await sql`SELECT id, answers, questions FROM survey_responses ORDER BY id`;
  await sql`UPDATE members SET hamlet_id = 2 WHERE id = 3`;
  assert.equal((await api.getAdminSurveyResults(id, '2')).response_count, 2);
  assert.equal((await api.getAdminSurveyResults(id, 'none')).response_count, 1);
  assert.deepEqual(await sql`SELECT id, answers, questions FROM survey_responses ORDER BY id`, before);
  await sql`UPDATE members SET hamlet_id = NULL WHERE id = 3`;
});

test('unknown, malformed and deleted hamlets never fall back to all responses; both services require survey permission', async () => {
  for (const filter of ['999', '4', '-1', '1 OR 1=1', '1.0', null, ['1']]) {
    await assert.rejects(api.getAdminSurveyResults(id, filter), /Invalid survey hamlet filter/);
    await assert.rejects(api.createAdminSurveyResultsExport(id, filter), /Invalid survey hamlet filter/);
  }
  denied = true;
  try {
    await assert.rejects(api.getAdminSurveyResults(id, '1'), /Forbidden/);
    await assert.rejects(api.createAdminSurveyResultsExport(id, '1'), /Forbidden/);
  } finally { denied = false; }
});
