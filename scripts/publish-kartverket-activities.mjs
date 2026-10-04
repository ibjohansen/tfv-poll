// Scoped, explicitly approved production data change. Publishes only active
// cross-country routes that have a persisted Kartverket source link.
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';

export async function publishKartverketActivities(db, { actor, expectedTargets, expectedDrafts }) {
  await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    await db.query("SET LOCAL lock_timeout='5s'");
    await db.query("SET LOCAL statement_timeout='60s'");
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended('tfv:publish-kartverket-activities', 0))");
    await db.query('LOCK TABLE activity_map_features IN SHARE ROW EXCLUSIVE MODE');
    const targetSql = `FROM activity_map_features f
      WHERE f.deleted_at IS NULL AND f.category = 'cross_country' AND f.feature_type = 'route'
        AND f.geometry IS NOT NULL AND f.geometry <> 'null'::jsonb
        AND EXISTS (SELECT 1 FROM activity_map_feature_sources fs
          WHERE fs.feature_id = f.id AND fs.source_id = 'kartverket')`;
    const before = (await db.query(`SELECT count(*)::int AS targets,
      count(*) FILTER (WHERE f.is_draft)::int AS drafts ${targetSql}`)).rows[0];
    assert.equal(before.targets, expectedTargets, 'Unexpected number of Kartverket routes');
    assert.equal(before.drafts, expectedDrafts, 'Unexpected number of Kartverket drafts');
    const updated = (await db.query(`UPDATE activity_map_features f
      SET is_draft = FALSE, last_changed_by = $1
      WHERE f.is_draft = TRUE AND f.deleted_at IS NULL
        AND f.category = 'cross_country' AND f.feature_type = 'route'
        AND f.geometry IS NOT NULL AND f.geometry <> 'null'::jsonb
        AND EXISTS (SELECT 1 FROM activity_map_feature_sources fs
          WHERE fs.feature_id = f.id AND fs.source_id = 'kartverket')
      RETURNING f.id`, [actor])).rowCount;
    assert.equal(updated, expectedDrafts, 'Every expected draft must be published');
    const after = (await db.query(`SELECT count(*)::int AS targets,
      count(*) FILTER (WHERE f.is_draft)::int AS drafts ${targetSql}`)).rows[0];
    assert.equal(after.targets, expectedTargets);
    assert.equal(after.drafts, 0, 'No Kartverket route may remain a draft');
    await db.query('COMMIT');
    return { targets: after.targets, published: updated, remainingDrafts: after.drafts };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

async function main() {
  const { values } = parseArgs({ options: {
    host: { type: 'string' }, environment: { type: 'string' }, confirmed: { type: 'boolean' },
    snapshot: { type: 'string' }, actor: { type: 'string' },
    'expected-targets': { type: 'string' }, 'expected-drafts': { type: 'string' },
  } });
  assert.equal(values.confirmed, true, 'Publishing requires explicit confirmation');
  assert.ok(['development', 'production'].includes(values.environment));
  if (values.environment === 'production') assert.match(values.snapshot || '', /^snap-[a-z0-9-]+$/, 'A verified restore snapshot is required');
  assert.match(values.actor || '', /^(?:system|admin):[a-z0-9@._+-]{3,200}$/i, 'A scoped actor is required');
  const expectedTargets = Number(values['expected-targets']);
  const expectedDrafts = Number(values['expected-drafts']);
  assert.ok(Number.isInteger(expectedTargets) && expectedTargets >= 0);
  assert.ok(Number.isInteger(expectedDrafts) && expectedDrafts >= 0 && expectedDrafts <= expectedTargets);
  const url = new URL(process.env.DATABASE_URL_UNPOOLED);
  assert.equal(url.hostname, values.host, 'Unexpected database host');
  assert.ok(!url.hostname.includes('-pooler'), 'Use a direct connection');
  assert.equal(url.pathname, '/neondb');
  url.searchParams.set('sslmode', 'verify-full');
  const db = new Client({ connectionString: url.href, connectionTimeoutMillis: 15_000 });
  try {
    await db.connect();
    assert.equal((await db.query('SELECT environment FROM application_environment WHERE singleton=TRUE')).rows[0]?.environment,
      values.environment);
    const result = await publishKartverketActivities(db, { actor: values.actor, expectedTargets, expectedDrafts });
    console.log(JSON.stringify({ published: true, ...result, snapshot: values.snapshot || null, occurredAt: new Date().toISOString() }));
  } finally { await db.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('Kartverket publishing stopped:', error.code || error.name,
      error.name === 'AssertionError' ? error.message : 'Transaction rolled back; no credentials or row data logged.');
    process.exitCode = 1;
  });
}
