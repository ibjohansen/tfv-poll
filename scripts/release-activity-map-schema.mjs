// Scoped, explicitly approved migration. Does not export rows, send mail or deploy code.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';
import { splitSqlStatements } from './split-sql-statements.mjs';

export function activityMapStatements(schema) {
  return splitSqlStatements(schema).filter((statement) =>
    /(?:CREATE TABLE IF NOT EXISTS|ALTER TABLE|INSERT INTO) activity_map_(?:features|categories|types|import_runs|sources|source_runs|source_items|feature_sources)\b/.test(statement)
    || /(?:CREATE (?:UNIQUE )?INDEX IF NOT EXISTS|DROP INDEX IF EXISTS|CREATE TRIGGER|DROP TRIGGER IF EXISTS) activity_map_\w+\b/.test(statement)
    || /CREATE OR REPLACE FUNCTION (?:increment_activity_map_feature_version|validate_activity_map_geometry|preserve_activity_map_type_geometry|record_audit_change)\(\)/.test(statement));
}

const quote = (value) => `"${value.replaceAll('"', '""')}"`;
async function fingerprint(db, columns, existingIds) {
  return (await db.query(`SELECT count(*)::int AS count, md5(COALESCE(string_agg(h, '' ORDER BY h), '')) AS checksum
    FROM (SELECT md5(to_jsonb(t)::text) h FROM (SELECT ${columns.map(quote).join(', ')} FROM activity_map_features
      WHERE id = ANY($1::text[])) t) hashes`, [existingIds])).rows[0];
}

export async function migrateActivityMapSchema(db, schema) {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  try {
    await db.query("SET LOCAL lock_timeout='5s'");
    await db.query("SET LOCAL statement_timeout='60s'");
    await db.query('SELECT pg_advisory_xact_lock(62719, 0)');
    await db.query('LOCK TABLE activity_map_features IN SHARE ROW EXCLUSIVE MODE');
    const columns = (await db.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'activity_map_features' ORDER BY ordinal_position`)).rows.map((row) => row.column_name);
    const existingIds = (await db.query('SELECT id FROM activity_map_features ORDER BY id')).rows.map((row) => row.id);
    const before = await fingerprint(db, columns, existingIds);
    const statements = activityMapStatements(schema);
    for (const statement of statements) await db.query(statement);
    assert.deepEqual(await fingerprint(db, columns, existingIds), before, 'Existing activities must remain unchanged');
    const invalid = (await db.query(`SELECT count(*)::int AS count FROM activity_map_features f
      LEFT JOIN activity_map_types t ON t.category = f.category AND t.id = f.feature_type
      WHERE t.id IS NULL OR (NULLIF(f.geometry, 'null'::jsonb) IS NOT NULL AND f.geometry->>'type' IS DISTINCT FROM
        CASE t.geometry_kind WHEN 'polygon' THEN 'Polygon' WHEN 'line' THEN 'LineString' ELSE 'Point' END)`)).rows[0].count;
    assert.equal(invalid, 0, 'Every existing geometry must match its catalog type');
    const counts = (await db.query(`SELECT (SELECT count(*)::int FROM activity_map_categories) AS categories,
      (SELECT count(*)::int FROM activity_map_types) AS types`)).rows[0];
    await db.query('COMMIT');
    return { statements: statements.length, activitiesPreserved: before.count, invalidGeometries: invalid, ...counts };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

async function main() {
  const { values } = parseArgs({ options: { host: { type: 'string' }, environment: { type: 'string' },
    confirmed: { type: 'boolean' }, snapshot: { type: 'string' }, 'schema-sha256': { type: 'string' } } });
  assert.equal(values.confirmed, true, 'Migration requires explicit confirmation');
  assert.ok(['development', 'production'].includes(values.environment));
  if (values.environment === 'production') {
    assert.match(values.snapshot || '', /^snap-[a-z0-9-]+$/, 'A verified restore snapshot is required');
  }
  const url = new URL(process.env.DATABASE_URL_UNPOOLED);
  assert.equal(url.hostname, values.host, 'Unexpected database host');
  assert.ok(!url.hostname.includes('-pooler'), 'Use a direct connection');
  assert.equal(url.pathname, '/neondb');
  url.searchParams.set('sslmode', 'verify-full');
  const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
  const hash = createHash('sha256').update(schema).digest('hex');
  assert.equal(hash, values['schema-sha256'], 'Only the tested schema may be applied');
  const db = new Client({ connectionString: url.href, connectionTimeoutMillis: 15000 });
  try {
    await db.connect();
    assert.equal((await db.query('SELECT environment FROM application_environment WHERE singleton=TRUE')).rows[0]?.environment, values.environment);
    console.log(JSON.stringify({ migrated: true, ...await migrateActivityMapSchema(db, schema), schemaHash: hash,
      snapshot: values.snapshot || null, occurredAt: new Date().toISOString() }));
  } finally { await db.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('Activity map migration stopped:', error.code || error.name,
      error.name === 'AssertionError' ? error.message : 'Transaction rolled back; no credentials or row data logged.');
    process.exitCode = 1;
  });
}
