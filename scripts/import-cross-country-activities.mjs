// Controlled external trail import. It never loads env files, publishes drafts,
// changes unrelated tables or calls a source unless action=preview is explicit.
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { Client } from 'pg';
import { ACTIVITY_MAP_SOURCE_IDS } from '../lib/activity-map-sources.js';
import { applyActivityImportCore, createActivityImportPreviewCore } from '../lib/activity-map-import/core.js';

const RUN_ID_PATTERN = /^[a-f0-9]{32}$/;
const SHA_PATTERN = /^[a-f0-9]{64}$/;

function sqlAdapter(client) {
  return {
    query: async (text, values = []) => (await client.query(text, values)).rows,
    transaction: async (build) => {
      const queued = [];
      const queries = build({ query(text, values = []) { const query = { text, values }; queued.push(query); return query; } });
      assert.equal(queries.length, queued.length, 'Every transaction query must be returned');
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      try {
        const results = [];
        for (const query of queued) results.push((await client.query(query.text, query.values)).rows);
        await client.query('COMMIT');
        return results;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    },
  };
}

async function verifyRun(db, runId) {
  const [result] = (await db.query(`SELECT r.status, r.plan_sha256, r.summary,
      count(DISTINCT i.feature_id)::int AS reviewed_items,
      count(DISTINCT fs.feature_id)::int AS linked_features,
      count(DISTINCT fs.source_id || ':' || fs.external_id)::int AS source_links,
      count(DISTINCT f.id) FILTER (WHERE f.is_draft = FALSE)::int AS published_features,
      count(DISTINCT f.id) FILTER (WHERE f.category <> 'cross_country' OR f.feature_type <> 'route'
        OR f.geometry->>'type' <> 'LineString' OR f.season <> 'winter')::int AS invalid_features
    FROM activity_map_source_runs r
    LEFT JOIN activity_map_source_items i ON i.run_id = r.id AND i.feature_id IS NOT NULL
    LEFT JOIN activity_map_feature_sources fs ON fs.source_id = i.source_id AND fs.external_id = i.external_id
    LEFT JOIN activity_map_features f ON f.id = fs.feature_id
    WHERE r.id = $1 GROUP BY r.id`, [runId])).rows;
  assert.ok(result, 'Import run not found');
  assert.equal(result.published_features, 0, 'Imported activities must remain drafts');
  assert.equal(result.invalid_features, 0, 'Imported activities must be valid winter LineStrings');
  return result;
}

async function main() {
  const { values } = parseArgs({ options: {
    action: { type: 'string' }, host: { type: 'string' }, environment: { type: 'string' },
    actor: { type: 'string' }, confirmed: { type: 'boolean' }, snapshot: { type: 'string' },
    'run-id': { type: 'string' }, 'plan-sha256': { type: 'string' }, selection: { type: 'string' },
  } });
  assert.ok(['preview', 'apply', 'verify'].includes(values.action), 'Action must be preview, apply or verify');
  assert.ok(['development', 'production'].includes(values.environment), 'Explicit environment is required');
  assert.match(values.actor || '', /^[^\s@]+@[^\s@]+$/, 'A traceable actor email is required');
  const url = new URL(process.env.DATABASE_URL_UNPOOLED);
  assert.equal(url.hostname, values.host, 'Unexpected database host');
  assert.ok(!url.hostname.includes('-pooler'), 'Use a direct connection');
  assert.equal(url.pathname, '/neondb');
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  url.searchParams.set('sslmode', 'verify-full');
  const db = new Client({ connectionString: url.href, connectionTimeoutMillis: 15_000 });
  try {
    await db.connect();
    const [marker] = (await db.query('SELECT environment FROM application_environment WHERE singleton=TRUE')).rows;
    assert.equal(marker?.environment, values.environment, 'Database environment marker does not match');
    const sql = sqlAdapter(db);
    if (values.action === 'preview') {
      const preview = await createActivityImportPreviewCore({ action: 'preview', sourceIds: ACTIVITY_MAP_SOURCE_IDS }, {
        sql, actor: values.actor.toLowerCase(),
      });
      const selectable = preview.candidates.filter((item) => ['new', 'matched', 'changed'].includes(item.status) && !item.matchedItemId);
      console.log(JSON.stringify({ action: 'preview', runId: preview.id, planSha256: preview.planSha256,
        rawSha256: preview.rawSha256, summary: preview.summary, selectable: selectable.length,
        fetchedAt: preview.fetchedAt }));
      return;
    }
    assert.match(values['run-id'] || '', RUN_ID_PATTERN, 'A reviewed run ID is required');
    if (values.action === 'verify') {
      console.log(JSON.stringify({ action: 'verify', runId: values['run-id'], ...await verifyRun(db, values['run-id']) }));
      return;
    }
    assert.equal(values.confirmed, true, 'Explicit approval required');
    assert.equal(values.selection, 'all-reviewable', 'Only the reviewed all-reviewable selection is supported');
    assert.match(values['plan-sha256'] || '', SHA_PATTERN, 'A reviewed plan hash is required');
    if (values.environment === 'production') {
      assert.match(values.snapshot || '', /^snap-[a-z0-9-]+$/, 'A verified Neon snapshot ID is required');
    }
    const items = (await db.query(`SELECT id FROM activity_map_source_items
      WHERE run_id = $1 AND status IN ('new', 'matched', 'changed') AND matched_item_id IS NULL
        AND decision IS NULL ORDER BY source_id, external_id`, [values['run-id']])).rows;
    assert.ok(items.length > 0 && items.length <= 500, 'Reviewed selection must contain 1-500 candidates');
    const result = await applyActivityImportCore({ action: 'apply', runId: values['run-id'],
      planSha256: values['plan-sha256'], itemIds: items.map((item) => item.id) }, {
      sql, actor: values.actor.toLowerCase(),
    });
    console.log(JSON.stringify({ action: 'apply', snapshot: values.snapshot || null, selection: values.selection,
      selected: items.length, ...result, verification: await verifyRun(db, values['run-id']) }));
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error('Cross-country import stopped:', error.code || error.name,
    error.name === 'AssertionError' || error.name === 'MapError' ? error.message : 'No credentials or row data logged.');
  process.exitCode = 1;
});
