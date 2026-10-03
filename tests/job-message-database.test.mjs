import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { loadModule } from './helpers/load-module.mjs';
import * as matrikkel from '../lib/matrikkel-client.js';
import { parseCadastralNumber } from '../lib/member-self-service-utils.js';
import { readJobMessage, formatJobMessage } from '../lib/job-messages.js';
import { getDictionary } from '../locales/index.js';
import { scopedTranslator } from '../lib/i18n/translate.js';

test('actual Matrikkel job SQL persists a coded error in the existing schema without rewriting legacy history', async () => {
  const db = new PGlite({ extensions: { pg_trgm } });
  try {
    await db.exec(await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8'));
    const sql = (strings, ...values) => db.query(strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, ''), values).then((result) => result.rows);
    const id = 'a'.repeat(32), legacyId = 'b'.repeat(32);
    await sql`INSERT INTO matrikkel_sync_runs (id, requested_by) VALUES (${id}, 'synthetic@example.test')`;
    await sql`INSERT INTO matrikkel_sync_runs (id, requested_by, status, error_message)
      VALUES (${legacyId}, 'synthetic@example.test', 'failed', 'Kjøringen ble stoppet manuelt.')`;
    const api = await loadModule('lib/matrikkel-sync.js', {
      'node:crypto': { randomUUID }, './db.js': { getSql: () => sql },
      './mock-store.js': { isMockMode: () => false }, './matrikkel-client.js': matrikkel,
      './member-self-service-utils.js': { parseCadastralNumber },
      './admin-access.js': { requireMatrikkelSync: async () => ({ email: 'synthetic@example.test' }) },
    });
    await api.failPendingMatrikkelRun(id);
    const [stored] = await sql`SELECT status, error_message FROM matrikkel_sync_runs WHERE id = ${id}`;
    assert.equal(stored.status, 'failed');
    assert.equal(readJobMessage(stored.error_message).code, 'JOB_START_FAILED');
    assert.match(formatJobMessage(stored.error_message, scopedTranslator(getDictionary('en'), 'jobs')), /background job could not be started/);
    const [legacy] = await sql`SELECT error_message FROM matrikkel_sync_runs WHERE id = ${legacyId}`;
    assert.equal(legacy.error_message, 'Kjøringen ble stoppet manuelt.');
    assert.equal(formatJobMessage(legacy.error_message, scopedTranslator(getDictionary('en'), 'jobs')), 'The run was stopped manually.');
    const reviewId = 'c'.repeat(32);
    const [member] = await sql`INSERT INTO members (h_number) VALUES ('SYNTHETIC-JOB-1') RETURNING id::text AS id`;
    await sql`INSERT INTO matrikkel_sync_runs (id, requested_by, total_count, status)
      VALUES (${reviewId}, 'synthetic@example.test', 1, 'completed')`;
    await sql`INSERT INTO matrikkel_sync_items (run_id, member_id, status, proposed_values)
      VALUES (${reviewId}, ${member.id}, 'review', '{"cadastral_number":"1/2","title_holder":"Synthetic owner"}'::jsonb)`;
    await api.approveMatrikkelItem(reviewId, member.id);
    const [approved] = await sql`SELECT message, status FROM matrikkel_sync_items WHERE run_id = ${reviewId}`;
    assert.equal(approved.status, 'updated');
    assert.equal(readJobMessage(approved.message).code, 'MANUALLY_APPROVED');
    assert.equal(formatJobMessage(approved.message, scopedTranslator(getDictionary('en'), 'jobs')), 'Manually approved.');
  } finally { await db.close(); }
});
