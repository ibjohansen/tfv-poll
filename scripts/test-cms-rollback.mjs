// Exercise the destructive CMS rollback only on an explicitly named, guarded,
// temporary schema-only Neon branch. Connection details stay in memory.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { parseArgs, promisify } from 'node:util';
import { Client } from 'pg';
import { testDatabaseUrl } from '../tests/helpers/postgres.mjs';

const exec = promisify(execFile);
const { values } = parseArgs({ options: {
  project: { type: 'string' }, branch: { type: 'string' }, host: { type: 'string' },
} });
let client;
let connectionString;

async function neon(args) {
  const { stdout } = await exec('neon', args, { timeout: 60000, maxBuffer: 1024 * 1024 });
  return stdout.trim();
}

async function main() {
  assert.ok(values.project && values.branch && values.host, 'Explicit --project, --branch and --host are required.');
  const branch = JSON.parse(await neon(['branches', 'get', values.branch, '--project-id', values.project, '--output', 'json']));
  assert.equal(branch.id, values.branch);
  assert.equal(branch.project_id, values.project);
  assert.equal(branch.init_source, 'parent-schema');
  assert.equal(branch.primary, false);
  assert.equal(branch.default, false);
  assert.equal(branch.protected, false);
  assert.equal(branch.current_state, 'ready');
  assert.match(branch.name, /^test-/);
  const expires = Date.parse(branch.expires_at);
  assert.ok(expires > Date.now() && expires < Date.now() + 7 * 86400000, 'Temporary branch must expire within seven days.');

  connectionString = await neon(['connection-string', branch.id, '--project-id', values.project, '--database-name', 'neondb', '--ssl', 'verify-full']);
  const guard = { TEST_NEON_HOST: values.host, TEST_NEON_BRANCH_ID: branch.id, TEST_NEON_RUN_ID: '0'.repeat(64) };
  testDatabaseUrl(connectionString, guard);
  client = new Client({ connectionString, connectionTimeoutMillis: 15000 });
  await client.connect();
  const { rows: [marker] } = await client.query(`SELECT g.run_id FROM integration_test_guard g
    JOIN application_environment e ON e.singleton = TRUE AND e.environment = 'development'
    WHERE g.singleton = TRUE AND g.branch_id = $1 AND g.expires_at > NOW()`, [branch.id]);
  assert.match(marker?.run_id || '', /^[a-f0-9]{64}$/, 'The isolated integration-test guard is missing.');

  const rollback = await readFile(new URL('../database/cms-improvement-rollback.sql', import.meta.url), 'utf8');
  const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
  await client.query(rollback);
  const { rows: [removed] } = await client.query(`SELECT
    to_regclass('public.cms_page_revisions') IS NULL AS revisions_removed,
    (SELECT COUNT(*)::int FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('cms_pages', 'cms_attachments')
        AND column_name IN ('body_schema_version', 'version', 'published_revision', 'image_decorative',
          'thumbnail_storage_key', 'thumbnail_size_bytes')) AS remaining_columns`);
  assert.equal(removed.revisions_removed, true);
  assert.equal(removed.remaining_columns, 0);

  await client.query(schema);
  const { rows: [restored] } = await client.query(`SELECT
    to_regclass('public.cms_page_revisions') IS NOT NULL AS revisions_restored,
    (SELECT COUNT(*)::int FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('cms_pages', 'cms_attachments')
        AND column_name IN ('body_schema_version', 'version', 'published_revision', 'image_decorative',
          'thumbnail_storage_key', 'thumbnail_size_bytes')) AS restored_columns`);
  assert.equal(restored.revisions_restored, true);
  assert.equal(restored.restored_columns, 6);
  const { rows: [backfill] } = await client.query(`SELECT
    COUNT(*) FILTER (WHERE p.version < 1 OR r.page_id IS NULL)::int AS missing_revisions,
    COUNT(*) FILTER (WHERE p.status = 'published' AND p.published_revision IS NULL)::int AS missing_published_revisions
    FROM cms_pages p LEFT JOIN cms_page_revisions r
      ON r.page_id = p.id AND r.revision_number = 1`);
  assert.equal(backfill.missing_revisions, 0);
  assert.equal(backfill.missing_published_revisions, 0);
  console.log(`CMS rollback and reapply verified on ${branch.id}; expires ${branch.expires_at}.`);
  console.log('Revision backfill verified; production and .env.local unchanged.');
}

try { await main(); } catch (error) {
  console.error('CMS rollback test failed:', error.code || error.name, String(error.message).replaceAll(connectionString || '\0', '[REDACTED]'));
  process.exitCode = 1;
} finally { await client?.end(); }
