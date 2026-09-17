// Run only against an already approved, temporary schema-only branch. Never
// loads .env.local, creates a branch, changes production or sends real email.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { testDatabaseUrl } from '../tests/helpers/postgres.mjs';

const exec = promisify(execFile);
const { values } = parseArgs({ options: { project: { type: 'string' }, branch: { type: 'string' }, host: { type: 'string' } } });
const id = () => randomUUID().replaceAll('-', '');
let client;
let connectionString;
async function neon(args) {
  const { stdout } = await exec('neon', args, { timeout: 60000, maxBuffer: 1024 * 1024 });
  return stdout.trim();
}
async function snapshot(ids) {
  const result = {};
  for (const [table, columns] of Object.entries({
    members: 'id, h_number, primary_contact_email',
    surveys: 'id, title, questions, question_version, is_open',
    survey_responses: 'id, member_id, survey_id, questions, answers, question_version',
    email_campaigns: 'id, survey_id, group_id, status',
    email_deliveries: 'id, campaign_id, member_id, recipient_email, status',
    survey_access_tokens: 'id, member_id, survey_id, token_hash',
  })) result[table] = (await client.query(`SELECT ${columns} FROM ${table} WHERE id = $1`, [ids[table]])).rows;
  return result;
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
  const runId = randomBytes(32).toString('hex');
  const guard = { TEST_NEON_HOST: values.host, TEST_NEON_BRANCH_ID: branch.id, TEST_NEON_RUN_ID: runId };
  connectionString = await neon(['connection-string', branch.id, '--project-id', values.project, '--database-name', 'neondb', '--ssl', 'verify-full']);
  testDatabaseUrl(connectionString, guard);
  client = new Client({ connectionString, connectionTimeoutMillis: 15000 });
  await client.connect();
  const { rows: tables } = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  const initialized = tables.some(({ tablename }) => tablename === 'integration_test_guard');
  let legacy;
  if (!initialized) {
    for (const { tablename } of tables) {
      const quoted = `"${tablename.replaceAll('"', '""')}"`;
      const { rows: [row] } = await client.query(`SELECT EXISTS (SELECT 1 FROM public.${quoted}) AS populated`);
      assert.equal(row.populated, false, `Refusing populated table ${tablename}: only empty schema-only branches may be initialized.`);
    }
    console.log(`Verified ${tables.length} empty public tables; no production rows copied.`);
    // Marker and legacy fixtures commit together. A failed initialization leaves
    // no partially trusted branch. Subsequent runs preserve all synthetic data.
    await client.query('BEGIN');
    try {
      await client.query(`CREATE TABLE integration_test_guard (
        singleton BOOLEAN PRIMARY KEY CHECK (singleton), branch_id TEXT NOT NULL,
        run_id TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, legacy JSONB NOT NULL)`);
      await client.query("INSERT INTO application_environment (singleton, environment) VALUES (TRUE, 'development')");
      const { rows: [member] } = await client.query("INSERT INTO members (h_number, primary_contact_email) VALUES ($1, 'legacy@example.test') RETURNING id", [`legacy-${id()}`]);
      const survey = id(), campaign = id(), delivery = id(), token = id();
      const questions = [{ id: 'q1', number: 1, text: 'Syntetisk gammelt spørsmål' }];
      await client.query("INSERT INTO surveys (id, title, is_open, ends_on, questions) VALUES ($1, 'Synthetic legacy survey', FALSE, '2099-12-31', $2)", [survey, JSON.stringify(questions)]);
      const { rows: [response] } = await client.query('INSERT INTO survey_responses (member_id, survey_id, questions, answers, question_version) VALUES ($1, $2, $3, $4, 1) RETURNING id', [member.id, survey, JSON.stringify(questions), JSON.stringify({ q1: 'ja' })]);
      const { rows: [group] } = await client.query("INSERT INTO member_email_groups (name) VALUES ('Synthetic legacy group') RETURNING id");
      await client.query("INSERT INTO email_campaigns (id, survey_id, group_id, requested_by, status) VALUES ($1, $2, $3, 'admin@example.test', 'completed')", [campaign, survey, group.id]);
      await client.query("INSERT INTO email_deliveries (id, campaign_id, member_id, survey_id, recipient_email, email_type, subject, status) VALUES ($1, $2, $3, $4, 'legacy@example.test', 'survey_invitation', 'Synthetic legacy', 'sent')", [delivery, campaign, member.id, survey]);
      await client.query("INSERT INTO survey_access_tokens (id, member_id, survey_id, token_hash, environment, audience, expires_at) VALUES ($1, $2, $3, $4, 'development', 'tfv-integration', NOW() + INTERVAL '1 day')", [token, member.id, survey, randomBytes(32).toString('hex')]);
      const ids = { members: member.id, surveys: survey, survey_responses: response.id, email_campaigns: campaign, email_deliveries: delivery, survey_access_tokens: token };
      legacy = { ids, snapshot: await snapshot(ids), groupId: group.id };
      await client.query('INSERT INTO integration_test_guard VALUES (TRUE, $1, $2, $3, $4)', [branch.id, runId, branch.expires_at, JSON.stringify(legacy)]);
      await client.query('COMMIT');
      console.log('Seeded synthetic legacy response, invitation and token before migration.');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  } else {
    const { rows: [marker] } = await client.query(`SELECT g.* FROM integration_test_guard g
      JOIN application_environment e ON e.singleton = TRUE AND e.environment = 'development'
      WHERE g.singleton = TRUE AND g.branch_id = $1 AND g.expires_at > NOW()`, [branch.id]);
    assert.ok(marker, 'Existing test branch guard does not match.');
    guard.TEST_NEON_RUN_ID = marker.run_id;
    legacy = marker.legacy;
    console.log('Reusing verified synthetic test data (no reset or production import).');
  }
  const env = Object.fromEntries(['PATH', 'SYSTEMROOT', 'TMPDIR', 'NODE_EXTRA_CA_CERTS'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  Object.assign(env, guard, { TEST_DATABASE_URL: connectionString, NODE_ENV: 'test', APP_ENVIRONMENT: 'development',
    DATABASE_URL: '', DATABASE_URL_UNPOOLED: '', MAILERSEND_ENABLED: 'false', MAILERSEND_BULK_ENABLED: 'false' });
  const tests = (await readdir(new URL('../tests/integration/', import.meta.url))).filter((file) => file.endsWith('.test.mjs')).sort().map((file) => `tests/integration/${file}`);
  const status = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--use-system-ca', '--experimental-vm-modules', '--test', '--test-concurrency=1', ...tests], { env, stdio: 'inherit', cwd: new URL('../', import.meta.url) });
    child.on('error', reject); child.on('exit', (code) => resolve(code ?? 1));
  });
  assert.deepEqual(await snapshot(legacy.ids), legacy.snapshot, 'Legacy fixture changed during migration/tests.');
  const { rows: [migrated] } = await client.query('SELECT response_key, respondent_email FROM survey_responses WHERE id = $1', [legacy.ids.survey_responses]);
  assert.equal(migrated.response_key, 'property'); assert.equal(migrated.respondent_email, null);
  const { rows: [delivery] } = await client.query('SELECT source_group_id FROM email_deliveries WHERE id = $1', [legacy.ids.email_deliveries]);
  assert.equal(delivery.source_group_id, legacy.groupId);
  console.log('Legacy snapshots preserved; response scope and group backfill verified.');
  console.log(`Schema SHA-256: ${createHash('sha256').update(await readFile(new URL('../database/schema.sql', import.meta.url))).digest('hex')}`);
  console.log(`Test branch: ${branch.id}; expires ${branch.expires_at}. Production and .env.local unchanged.`);
  process.exitCode = status;
}
try { await main(); } catch (error) {
  // Do not dump child-process output, connection strings or environment values.
  console.error('Isolated test run failed:', error.code || error.name, String(error.message).replaceAll(connectionString || '\0', '[REDACTED]'));
  process.exitCode = 1;
} finally { await client?.end(); }
