import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as seed from '../../data/survey.js';
import * as dates from '../../lib/survey-dates.js';
import * as questions from '../../lib/survey-questions.js';
import { copyContentFiles } from '../../lib/content-copy.js';
import { createTestDatabase } from '../helpers/postgres.mjs';
import { loadModule, plain } from '../helpers/load-module.mjs';

const db = createTestDatabase();
const id = () => crypto.randomUUID().replaceAll('-', '');
let api;
before(async () => {
  await db.migrate();
  const blocked = () => { throw new Error('Unexpected service in attachment listing'); };
  const files = await loadModule('lib/survey-files.js', {
    'node:crypto': crypto, './db.js': { getSql: () => db.sql }, './mock-store.js': { isMockMode: () => false },
    './admin-access.js': { requirePermission: blocked }, './cms-storage.js': { deleteCmsObject: blocked, uploadCmsObject: blocked },
    './upload-validation.js': { defaultFileTitle: blocked, validateUploadedFile: blocked },
  });
  api = await loadModule('lib/admin-surveys.js', {
    './db.js': { getSql: () => db.sql }, 'node:crypto': crypto, './mock-store.js': { isMockMode: () => false },
    '../data/survey.js': seed, './admin-access.js': { requirePermission: async () => ({ email: 'admin@example.test' }) },
    './survey-dates.js': dates, './survey-files.js': files, './survey-questions.js': questions,
    './content-copy.js': { copyContentFiles: (files, prefix, persist) => copyContentFiles(files, prefix, persist, {
      downloadCmsObject: async () => ({ Body: { transformToByteArray: async () => new Uint8Array([1, 2]) } }),
      uploadCmsObject: async () => {}, deleteCmsObject: async () => {},
    }) },
  });
});
after(async () => db.close());

test('custom choices persist and increment question versions without rewriting existing answer snapshots', async () => {
  const input = { title: 'Syntetisk survey', isOpen: true, endsOn: '2099-12-31', questions: [{ id: 'q1', text: 'Velg dager', multiple: true,
    options: [{ value: 'mon', label: 'Mandag' }, { value: 'tue', label: 'Tirsdag' }] }] };
  const created = await api.createAdminSurvey(input);
  assert.deepEqual(plain(created.questions), questions.normalizeSurveyQuestions(input.questions));
  const [member] = await db.sql`INSERT INTO members (h_number) VALUES (${id()}) RETURNING id`;
  const [response] = await db.sql`INSERT INTO survey_responses (member_id, survey_id, questions, answers, question_version)
    VALUES (${member.id}, ${created.id}, ${JSON.stringify(created.questions)}::jsonb, '{"q1":["mon","tue"]}', ${created.question_version}) RETURNING id`;
  assert.equal((await api.updateAdminSurvey(created.id, input)).question_version, 1);
  const changed = await api.updateAdminSurvey(created.id, { ...input, questions: [{ ...input.questions[0], multiple: false }] });
  assert.equal(changed.question_version, 2);
  const [saved] = await db.sql`SELECT questions, answers, question_version FROM survey_responses WHERE id = ${response.id}`;
  assert.equal(saved.question_version, 1); assert.deepEqual(saved.questions, plain(created.questions));
  assert.deepEqual(saved.answers, { q1: ['mon', 'tue'] });
});

test('survey copy keeps questions and answer policy but not responses, recipients or invitation tokens', async () => {
  const source = await api.createAdminSurvey({ title: 'Syntetisk kilde', isOpen: true, endsOn: '2099-12-31', questions: [{ id: 'q1', text: 'Ja eller nei?' }] });
  await db.sql`UPDATE surveys SET single_response_per_property = FALSE, question_version = 4 WHERE id = ${source.id}`;
  const [member] = await db.sql`INSERT INTO members (h_number) VALUES (${id()}) RETURNING id`;
  await db.sql`INSERT INTO survey_responses (member_id, survey_id, questions, answers, question_version)
    VALUES (${member.id}, ${source.id}, ${JSON.stringify(source.questions)}::jsonb, '{"q1":"ja"}', 4)`;
  const campaignId = id(), fileId = id();
  await db.sql`INSERT INTO email_campaigns (id, survey_id, requested_by, status) VALUES (${campaignId}, ${source.id}, 'admin@example.test', 'completed')`;
  await db.sql`INSERT INTO email_deliveries (id, campaign_id, member_id, survey_id, recipient_email, email_type, subject, status)
    VALUES (${id()}, ${campaignId}, ${member.id}, ${source.id}, 'synthetic@example.test', 'survey_invitation', 'Syntetisk', 'sent')`;
  await db.sql`INSERT INTO survey_access_tokens (id, member_id, survey_id, token_hash, environment, audience, expires_at)
    VALUES (${id()}, ${member.id}, ${source.id}, ${crypto.randomBytes(32).toString('hex')}, 'development', 'tfv-integration', NOW() + INTERVAL '1 day')`;
  await db.sql`INSERT INTO survey_attachments (id, survey_id, title, original_filename, storage_key, mime_type, size_bytes)
    VALUES (${fileId}, ${source.id}, 'Test', 'test.pdf', ${`synthetic/${fileId}`}, 'application/pdf', 2)`;
  const copy = await api.copyAdminSurvey(source.id);
  assert.notEqual(copy.id, source.id); assert.equal(copy.is_open, false); assert.equal(copy.single_response_per_property, false);
  assert.equal(copy.question_version, 1); assert.deepEqual(plain(copy.questions), plain(source.questions));
  assert.equal(copy.attachments.length, 1); assert.notEqual(copy.attachments[0].id, fileId);
  const [file] = await db.sql`SELECT storage_key FROM survey_attachments WHERE id = ${copy.attachments[0].id}`;
  assert.notEqual(file.storage_key, `synthetic/${fileId}`);
  for (const table of ['survey_responses', 'email_campaigns', 'email_deliveries', 'survey_access_tokens']) {
    assert.equal((await db.sql.query(`SELECT id FROM ${table} WHERE survey_id = $1`, [copy.id])).length, 0);
  }
  await api.deleteAdminSurvey(copy.id);
  assert.equal((await db.sql`SELECT is_open FROM surveys WHERE id = ${source.id}`)[0].is_open, true);
});
