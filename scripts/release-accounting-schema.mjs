// Approved accounting-only migration. Never loads env files, exports rows,
// deploys code, restores a snapshot, or changes unrelated application data.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';
import { splitSqlStatements } from './split-sql-statements.mjs';

export function accountingStatements(schema) {
  const selected = splitSqlStatements(schema).filter((statement) =>
    /CREATE TABLE IF NOT EXISTS accounting_(years|expenses|attachments)\s*\(/.test(statement)
    || /CREATE (?:UNIQUE )?INDEX IF NOT EXISTS accounting_\w+\s/.test(statement)
    || /CREATE OR REPLACE FUNCTION record_audit_change\(\)/.test(statement)
    || /(?:DROP TRIGGER IF EXISTS|CREATE TRIGGER) accounting_\w+\s/.test(statement));
  assert.equal(selected.length, 19, 'Review the accounting migration selection if the schema changes');
  return selected;
}

const quote = (name) => `"${name.replaceAll('"', '""')}"`;
async function fingerprints(db) {
  const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  const result = {};
  for (const { tablename } of tables) {
    // Only aggregates leave Postgres, not member details, receipts or tokens.
    result[tablename] = (await db.query(`SELECT count(*)::int AS count,
      md5(COALESCE(string_agg(h, '' ORDER BY h), '')) AS checksum
      FROM (SELECT md5(to_jsonb(t)::text) h FROM ${quote(tablename)} t) hashes`)).rows[0];
  }
  return result;
}

async function activeJobs(db) {
  return Number((await db.query(`SELECT
    (SELECT count(*) FROM email_campaigns WHERE status IN ('pending','running') OR worker_lease_expires_at > NOW()) +
    (SELECT count(*) FROM email_deliveries WHERE status IN ('pending','processing')) +
    (SELECT count(*) FROM newsletter_campaigns WHERE status IN ('pending','running') OR worker_lease_expires_at > NOW()) +
    (SELECT count(*) FROM matrikkel_sync_runs WHERE status IN ('pending','running') OR worker_lease_expires_at > NOW()) +
    (SELECT count(*) FROM survey_response_receipts WHERE status IN ('pending','processing')) AS n`)).rows[0].n);
}

export async function verifyAccountingSchema(db) {
  const tables = ['accounting_years', 'accounting_expenses', 'accounting_attachments'];
  const found = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1::text[])", [tables])).rows;
  assert.equal(found.length, 3);
  const triggers = (await db.query(`SELECT count(*)::int AS n FROM pg_trigger
    WHERE NOT tgisinternal AND tgrelid = ANY($1::regclass[]) AND tgenabled = 'O'`, [tables])).rows[0].n;
  assert.equal(triggers, 6);
  const indexes = (await db.query(`SELECT count(*)::int AS n FROM pg_indexes
    WHERE schemaname='public' AND indexname IN ('accounting_expenses_year_idx',
      'accounting_expenses_invoice_idx', 'accounting_attachments_year_idx')`)).rows[0].n;
  assert.equal(indexes, 3);
  const [generated] = (await db.query(`SELECT is_generated FROM information_schema.columns
    WHERE table_schema='public' AND table_name='accounting_expenses' AND column_name='amount_ore'`)).rows;
  assert.equal(generated?.is_generated, 'ALWAYS');
  const [audit] = (await db.query("SELECT prosrc FROM pg_proc WHERE oid='record_audit_change()'::regprocedure")).rows;
  assert.ok(audit.prosrc.includes("'accounting_attachments'"));
  return { tables: 3, auditTriggers: triggers, indexes, generatedNokAmount: true };
}

async function main() {
  const { values } = parseArgs({ options: { action: { type: 'string', default: 'status' },
    host: { type: 'string' }, environment: { type: 'string' }, confirmed: { type: 'boolean' },
    snapshot: { type: 'string' }, 'schema-sha256': { type: 'string' } } });
  assert.ok(['status', 'migrate', 'verify'].includes(values.action));
  assert.ok(['development', 'production'].includes(values.environment));
  const url = new URL(process.env.DATABASE_URL_UNPOOLED);
  assert.ok(values.host && url.hostname === values.host && !url.hostname.includes('-pooler'));
  assert.equal(url.pathname, '/neondb');
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  url.searchParams.set('sslmode', 'verify-full');
  const db = new Client({ connectionString: url.href, connectionTimeoutMillis: 15000 });
  try {
    await db.connect();
    assert.equal((await db.query('SELECT environment FROM application_environment WHERE singleton=TRUE')).rows[0]?.environment, values.environment);
    const jobs = await activeJobs(db);
    console.log(JSON.stringify({ action: values.action, environment: values.environment, activeJobs: jobs }));
    if (values.action === 'verify') { console.log(JSON.stringify(await verifyAccountingSchema(db))); return; }
    if (values.action === 'status') {
      const saved = await fingerprints(db);
      console.log(JSON.stringify({ counts: Object.fromEntries(Object.entries(saved).map(([name, state]) => [name, state.count])) }));
      return;
    }
    assert.equal(values.confirmed, true, '--confirmed is required');
    assert.equal(jobs, 0, 'Wait for active background work to finish');
    if (values.environment === 'production') assert.match(values.snapshot || '', /^snap-[a-z0-9-]+$/, 'A verified restore snapshot is required');
    const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
    const hash = createHash('sha256').update(schema).digest('hex');
    assert.equal(hash, values['schema-sha256'], 'Only the reviewed and tested schema may be released');
    const statements = accountingStatements(schema);
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    try {
      await db.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'");
      await db.query('SELECT pg_advisory_xact_lock(62719, 0)');
      assert.equal(await activeJobs(db), 0);
      const before = await fingerprints(db);
      for (const statement of statements) await db.query(statement);
      const verified = await verifyAccountingSchema(db);
      const after = await fingerprints(db);
      for (const [table, state] of Object.entries(before)) assert.deepEqual(after[table], state, `Existing data changed in ${table}`);
      await db.query('COMMIT');
      console.log(JSON.stringify({ migrated: true, schemaHash: hash, statements: statements.length,
        existingDataPreserved: true, verifiedExistingTables: Object.keys(before).length,
        ...verified, occurredAt: new Date().toISOString() }));
    } catch (error) { await db.query('ROLLBACK'); throw error; }
  } finally { await db.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('Accounting migration stopped:', error.code || error.name,
      error.name === 'AssertionError' ? error.message : 'Inspect the operation; no credentials or database detail logged.');
    process.exitCode = 1;
  });
}
