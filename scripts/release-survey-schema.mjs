// Explicitly approved operational migration only. No env-file loading, deploy,
// credentials in output, row exports, mail sends or automatic rollback/restore.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import assert from 'node:assert/strict';
import { Client } from 'pg';

const schemaHash = 'adeb87b2b28839172a77e7fcf85e74094ff08ead1d3bfc39712e8f143a5d5a28';
const guarded = ['surveys', 'survey_responses', 'survey_access_tokens', 'survey_sessions', 'email_campaigns', 'email_deliveries', 'newsletter_campaigns'];
const protectedData = ['members', 'surveys', 'survey_responses', 'survey_access_tokens', 'survey_sessions',
  'email_campaigns', 'email_deliveries', 'newsletter_campaigns', 'survey_attachments', 'cms_pages', 'cms_attachments',
  'member_hamlets', 'member_email_groups', 'member_email_group_members'];
const guardName = 'tfv_survey_release_guard';
const release = '20260917-survey-options';
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
const { values } = parseArgs({ options: { action: { type: 'string', default: 'status' }, host: { type: 'string' }, environment: { type: 'string' }, confirmed: { type: 'boolean' }, snapshot: { type: 'string' } } });
let db;
async function counts() {
  const result = {};
  for (const table of protectedData) result[table] = (await db.query(`SELECT count(*)::int AS n FROM ${quote(table)}`)).rows[0].n;
  return result;
}
async function activeJobs() {
  return (await db.query(`SELECT
    (SELECT count(*) FROM email_campaigns WHERE status IN ('pending','running') OR worker_lease_expires_at > NOW()) +
    (SELECT count(*) FROM email_deliveries WHERE status IN ('pending','processing')) +
    (SELECT count(*) FROM newsletter_campaigns WHERE status IN ('pending','running') OR worker_lease_expires_at > NOW()) +
    (SELECT count(*) FROM matrikkel_sync_runs WHERE status IN ('pending','running') OR worker_lease_expires_at > NOW()) AS n`)).rows[0].n;
}
async function guards() {
  return (await db.query('SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = $1 AND NOT tgisinternal', [guardName])).rows[0].n;
}
async function fingerprint(table, columns) {
  const projection = columns.map(quote).join(', ');
  // Only a count and whole-table checksum leave the database, never row data.
  return (await db.query(`SELECT count(*)::int AS count, md5(COALESCE(string_agg(h, '' ORDER BY h), '')) AS checksum
    FROM (SELECT md5(to_jsonb(t)::text) h FROM (SELECT ${projection} FROM ${quote(table)}) t) hashed`)).rows[0];
}
async function main() {
  assert.ok(['status', 'migrate', 'resume'].includes(values.action));
  assert.ok(['development', 'production'].includes(values.environment));
  const url = new URL(process.env.DATABASE_URL_UNPOOLED);
  assert.ok(values.host && url.hostname === values.host && !url.hostname.includes('-pooler'));
  assert.equal(url.pathname, '/neondb');
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  url.searchParams.set('sslmode', 'verify-full');
  db = new Client({ connectionString: url.href, connectionTimeoutMillis: 15000 });
  await db.connect();
  assert.equal((await db.query('SELECT environment FROM application_environment WHERE singleton=TRUE')).rows[0]?.environment, values.environment);
  console.log(JSON.stringify({ action: values.action, environment: values.environment, activeJobs: Number(await activeJobs()), maintenanceGuards: await guards(), counts: await counts() }));
  if (values.action === 'status') return;
  assert.equal(values.confirmed, true, '--confirmed is required for a change');
  if (values.action === 'migrate') {
    if (values.environment === 'production') assert.match(values.snapshot || '', /^snap-[a-z0-9-]+$/, 'A verified restore snapshot is required');
    const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
    assert.equal(createHash('sha256').update(schema).digest('hex'), schemaHash, 'Only the tested schema may be released');
    assert.equal(await guards(), 0, 'Maintenance already exists; investigate instead of overwriting it');
    await db.query('BEGIN');
    try {
      await db.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'");
      await db.query(`LOCK TABLE ${[...new Set([...protectedData, 'matrikkel_sync_runs', 'audit_log'])].sort().map(quote).join(', ')} IN SHARE ROW EXCLUSIVE MODE`);
      assert.equal(Number(await activeJobs()), 0, 'Do not interrupt a live or pending job');
      const before = {};
      const hasReceipts = (await db.query("SELECT to_regclass('public.survey_response_receipts') IS NOT NULL AS present")).rows[0].present;
      const beforeReceipts = hasReceipts ? (await db.query('SELECT count(*)::int AS n FROM survey_response_receipts')).rows[0].n : 0;
      for (const table of protectedData) {
        const columns = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [table])).rows.map((r) => r.column_name);
        before[table] = { columns, fingerprint: await fingerprint(table, columns) };
      }
      await db.query(`CREATE FUNCTION ${guardName}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF current_setting('tfv.survey_schema_release', TRUE) IS DISTINCT FROM '${release}' THEN
          RAISE EXCEPTION 'Survey maintenance in progress; please retry shortly' USING ERRCODE='55000';
        END IF; RETURN NULL; END; $$`);
      for (const table of guarded) await db.query(`CREATE TRIGGER ${guardName} BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON ${quote(table)} FOR EACH STATEMENT EXECUTE FUNCTION ${guardName}()`);
      await db.query("SELECT set_config('tfv.survey_schema_release', $1, TRUE)", [release]);
      await db.query(schema);
      for (const [table, saved] of Object.entries(before)) assert.deepEqual(await fingerprint(table, saved.columns), saved.fingerprint, `Existing data changed in ${table}`);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM survey_response_receipts')).rows[0].n, beforeReceipts);
      assert.equal(await guards(), guarded.length);
      await db.query('COMMIT');
      console.log(JSON.stringify({ migrated: true, schemaHash, existingDataPreserved: true, verifiedTables: protectedData.length, maintenanceGuards: guarded.length, occurredAt: new Date().toISOString() }));
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    // Verify a fresh transaction cannot bypass the temporary write barrier.
    try { await db.query('UPDATE surveys SET is_open=is_open WHERE FALSE'); throw new Error('Maintenance barrier is missing'); }
    catch (error) { if (error.code !== '55000') throw error; }
    console.log('Write barrier verified. Resume only after the matching deploy is published and verified.');
  } else {
    assert.equal(await guards(), guarded.length, 'Expected all temporary guards before resume');
    await db.query('BEGIN');
    try {
      await db.query("SET LOCAL lock_timeout='5s'");
      for (const table of guarded) await db.query(`DROP TRIGGER ${guardName} ON ${quote(table)}`);
      await db.query(`DROP FUNCTION ${guardName}()`);
      await db.query('COMMIT');
      console.log(JSON.stringify({ resumed: true, maintenanceGuards: await guards(), occurredAt: new Date().toISOString() }));
    } catch (error) { await db.query('ROLLBACK'); throw error; }
  }
}
try { await main(); }
catch (error) { console.error('Release operation stopped:', error.code || error.name, error.name === 'AssertionError' ? error.message : 'Inspect the operation before proceeding; no credentials or database detail logged.'); process.exitCode = 1; }
finally { await db?.end(); }
