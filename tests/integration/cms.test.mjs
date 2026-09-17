import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as crypto from 'node:crypto';
import { createTestDatabase } from '../helpers/postgres.mjs';
import { loadModule } from '../helpers/load-module.mjs';
import * as validation from '../../lib/cms-validation.js';
import * as richText from '../../lib/rich-text.js';
import { copyContentFiles } from '../../lib/content-copy.js';

const db = createTestDatabase();
let api;
before(async () => {
  await db.migrate();
  api = await loadModule('lib/cms-pages.js', {
    'node:crypto': crypto, './db.js': { getSql: () => db.sql }, './mock-store.js': { isMockMode: () => false },
    './admin-access.js': { requirePermission: async () => ({ email: 'editor@example.test' }) },
    './cms-validation.js': validation, './rich-text.js': richText,
    './public-content-cache.js': { revalidatePublicCmsContent: () => {} },
    './content-copy.js': { copyContentFiles: (files, prefix, persist) => copyContentFiles(files, prefix, persist, {
      downloadCmsObject: async () => ({ Body: { transformToByteArray: async () => new Uint8Array([1, 2]) } }), uploadCmsObject: async () => {}, deleteCmsObject: async () => {},
    }) },
  });
});

test('copying a published article creates an independent unpublished draft', async () => {
  const original = await api.createAdminCmsPage({ title: 'Original', slug: `test-${randomUUID()}`, category: 'Nyheter', status: 'published', body: 'Original body' });
  const fileId = randomUUID().replaceAll('-', '');
  await db.sql`INSERT INTO cms_attachments (id, page_id, kind, title, original_filename, storage_key, mime_type, size_bytes)
    VALUES (${fileId}, ${original.id}, 'image', 'Foto', 'test.jpg', ${`synthetic/${fileId}`}, 'image/jpeg', 2)`;
  const copy = await api.copyAdminCmsPage(original.id);
  assert.notEqual(copy.id, original.id); assert.notEqual(copy.slug, original.slug);
  assert.equal(copy.status, 'draft'); assert.equal(copy.published_at, null); assert.equal(copy.body, original.body);
  assert.notEqual(copy.image.id, fileId);
  const [copyFile] = await db.sql`SELECT storage_key FROM cms_attachments WHERE id = ${copy.image.id}`;
  assert.notEqual(copyFile.storage_key, `synthetic/${fileId}`);
  await api.deleteAdminCmsPage(copy.id);
  assert.equal((await api.getAdminCmsPage(original.id)).status, 'published');
});
after(async () => db.close());

test('CMS roundtrips legacy text and sanitized rich text without changing publication rules', async () => {
  const input = { title: 'Syntetisk artikkel', slug: `test-${randomUUID()}`, category: 'Nyheter', status: 'draft', body: 'Legacy <b>bokstavelig</b>' };
  const page = await api.createAdminCmsPage(input);
  assert.equal(page.body, input.body); assert.equal(page.body_rich_text, null);
  assert.equal(await api.getPublishedCmsPage(input.slug), null);
  const rich = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Trygg tekst', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] };
  const updated = await api.updateAdminCmsPage(page.id, { ...input, status: 'published', bodyRichText: rich });
  assert.equal(updated.body, 'Trygg tekst');
  assert.deepEqual(updated.body_rich_text.content[0].content[0].marks, [{ type: 'bold' }]);
  assert.equal((await api.getPublishedCmsPage(input.slug)).body, 'Trygg tekst');
  const audit = await db.sql`SELECT changed_by FROM audit_log WHERE table_name = 'cms_pages' AND row_id = ${page.id}`;
  assert.equal(audit.length, 2); assert.ok(audit.every((event) => event.changed_by === 'editor@example.test'));
});

test('real audit triggers redact verification hashes and private storage keys on insert and update', async () => {
  const id = randomUUID().replaceAll('-', '');
  const hash = crypto.randomBytes(32).toString('hex');
  await db.sql`INSERT INTO member_requests (id, request_type, status, h_number, requested_contact_name, requested_primary_email, verification_token_hash, verification_expires_at, last_changed_by)
    VALUES (${id}, 'membership', 'pending_verification', ${`test-${randomUUID()}`}, 'Syntetisk', 'synthetic@example.test', ${hash}, NOW() + INTERVAL '15 minutes', 'public')`;
  await db.sql`UPDATE member_requests SET verification_token_hash = ${crypto.randomBytes(32).toString('hex')}, last_changed_by = 'system' WHERE id = ${id}`;
  const page = await api.createAdminCmsPage({ title: 'Test', slug: `test-${randomUUID()}`, category: 'Nyheter', status: 'draft' });
  const fileId = randomUUID().replaceAll('-', '');
  await db.sql`INSERT INTO cms_attachments (id, page_id, kind, title, original_filename, storage_key, mime_type, size_bytes, last_changed_by)
    VALUES (${fileId}, ${page.id}, 'attachment', 'Syntetisk', 'test.pdf', ${`private-fixture/${randomUUID()}`}, 'application/pdf', 42, 'editor@example.test')`;
  await db.sql`UPDATE cms_attachments SET storage_key = ${`private-fixture/${randomUUID()}`}, title = 'Rettet', last_changed_by = 'editor@example.test' WHERE id = ${fileId}`;
  const surveyId = randomUUID().replaceAll('-', '');
  await db.sql`INSERT INTO surveys (id, title, ends_on) VALUES (${surveyId}, 'Syntetisk undersøkelse', '2099-12-31')`;
  const surveyFileId = randomUUID().replaceAll('-', '');
  await db.sql`INSERT INTO survey_attachments (id, survey_id, title, original_filename, storage_key, mime_type, size_bytes, last_changed_by)
    VALUES (${surveyFileId}, ${surveyId}, 'Bakgrunn', 'bakgrunn.pdf', ${`private-survey-fixture/${randomUUID()}`}, 'application/pdf', 42, 'editor@example.test')`;
  await db.sql`UPDATE survey_attachments SET storage_key = ${`private-survey-fixture/${randomUUID()}`}, title = 'Rettet bakgrunn', last_changed_by = 'editor@example.test' WHERE id = ${surveyFileId}`;
  const events = await db.sql`SELECT before_value, after_value FROM audit_log WHERE row_id IN (${id}, ${fileId}, ${surveyFileId})`;
  assert.equal(events.length, 5, 'a hash-only change is intentionally not an audit event');
  for (const event of events) for (const value of [event.before_value, event.after_value].filter(Boolean)) {
    assert.equal(Object.hasOwn(value, 'verification_token_hash'), false); assert.equal(Object.hasOwn(value, 'storage_key'), false);
  }
});
