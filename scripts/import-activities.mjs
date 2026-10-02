import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { Client } from 'pg';
import { applyActivityImport, buildActivityImportPlan, readActivityImportState } from './activity-workbook-import.mjs';

async function main() {
  const { values } = parseArgs({ options: {
    input: { type: 'string' }, host: { type: 'string' }, environment: { type: 'string' },
    apply: { type: 'boolean' }, confirmed: { type: 'boolean' }, 'plan-sha256': { type: 'string' },
    snapshot: { type: 'string' }, actor: { type: 'string' },
  } });
  const source = JSON.parse(await readFile(values.input, 'utf8'));
  const url = new URL(process.env.DATABASE_URL_UNPOOLED);
  assert.equal(url.hostname, values.host, 'Unexpected database host');
  assert.ok(!url.hostname.includes('-pooler'), 'Use a direct connection');
  assert.equal(url.pathname, '/neondb');
  assert.ok(['development', 'production'].includes(values.environment));
  url.searchParams.set('sslmode', 'verify-full');
  const db = new Client({ connectionString: url.href, connectionTimeoutMillis: 15000 });
  try {
    await db.connect();
    assert.equal((await db.query('SELECT environment FROM application_environment WHERE singleton=TRUE')).rows[0]?.environment, values.environment);
    if (values.apply) {
      assert.equal(values.confirmed, true, 'Explicit approval required');
      assert.match(values.snapshot || '', /^snap-[a-z0-9-]+$/, 'A verified Neon snapshot ID is required');
      assert.ok(values.actor?.trim());
      console.log(JSON.stringify(await applyActivityImport(db, source, { expectedHash: values['plan-sha256'], snapshotId: values.snapshot, actor: values.actor })));
    } else {
      const plan = buildActivityImportPlan(source, await readActivityImportState(db));
      console.log(JSON.stringify({ planHash: plan.hash, ...plan.summary }));
    }
  } finally { await db.end(); }
}

main().catch((error) => {
  console.error('Activity import stopped:', error.code || error.name,
    error.name === 'AssertionError' || error.name === 'MapError' ? error.message : 'No credentials or row data logged.');
  process.exitCode = 1;
});
