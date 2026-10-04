import test from 'node:test';
import assert from 'node:assert/strict';
import { distance } from '@turf/turf';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { ACTIVITY_MAP_CENTER } from '../lib/activity-map-display.js';
import { parseKartverketGpxZip } from '../lib/activity-map-import/kartverket.js';
import { normalizeSourceLine } from '../lib/activity-map-import/geometry.js';
import { parseOsmNordicRoutes } from '../lib/activity-map-import/osm.js';
import { buildActivityImportPlan } from '../lib/activity-map-import/plan.js';
import { applyActivityImportCore, createActivityImportPreviewCore } from '../lib/activity-map-import/core.js';
import { ACTIVITY_MAP_SOURCE_IDS, CROSS_COUNTRY_CATEGORY } from '../lib/activity-map-sources.js';
import { MapError } from '../lib/map/errors.js';
import { publishKartverketActivities } from '../scripts/publish-kartverket-activities.mjs';

const kartverketFixture = Buffer.from('UEsDBAoAAAAAALhSRF0iCxhEXQEAAF0BAAALAAAAZml4dHVyZS5ncHg8P3htbCB2ZXJzaW9uPSIxLjAiPz48Z3B4IHZlcnNpb249IjEuMSI+PHJ0ZT48bmFtZT5za2ktMTwvbmFtZT48ZGVzYz5UZXN0bMO4eXBhPC9kZXNjPjxzcmM+VGVzdGxhZ2V0PC9zcmM+PHR5cGU+U2tpbMO4eXBlPC90eXBlPjxydGVwdCBsYXQ9IjYwLjQ3MjAiIGxvbj0iOS40OTMwIi8+PHJ0ZXB0IGxhdD0iNjAuNDczMCIgbG9uPSI5LjQ5NDAiLz48L3J0ZT48cnRlPjxuYW1lPndhbGstMTwvbmFtZT48ZGVzYz5Gb3R0dXI8L2Rlc2M+PHR5cGU+Rm90cnV0ZTwvdHlwZT48cnRlcHQgbGF0PSI2MC40NzIwIiBsb249IjkuNDkzMCIvPjxydGVwdCBsYXQ9IjYwLjQ3MzAiIGxvbj0iOS40OTQwIi8+PC9ydGU+PC9ncHg+UEsBAhQACgAAAAAAuFJEXSILGERdAQAAXQEAAAsAAAAAAAAAAAAAAAAAAAAAAGZpeHR1cmUuZ3B4UEsFBgAAAAABAAEAOQAAAIYBAAAAAA==', 'base64');

test('Kartverket GPX adapter keeps ski routes and stable source metadata', async () => {
  const routes = await parseKartverketGpxZip(kartverketFixture);
  assert.equal(routes.length, 1);
  assert.equal(routes[0].externalId, 'gpx:ski-1');
  assert.equal(routes[0].name, 'Testløypa (ski-1)');
  assert.equal(routes[0].matchName, 'Testløypa');
  assert.equal(routes[0].operator, 'Testlaget');
  assert.deepEqual(routes[0].coordinates, [[9.493, 60.472], [9.494, 60.473]]);
});

test('OSM adapter prefers a relation over its member way', () => {
  const data = { elements: [
    { type: 'relation', id: 4, tags: { name: 'Runden', 'piste:type': 'nordic' }, members: [
      { type: 'way', ref: 8, geometry: [{ lon: 9.493, lat: 60.472 }, { lon: 9.494, lat: 60.473 }] },
    ] },
    { type: 'way', id: 8, tags: { name: 'Runden', 'piste:type': 'nordic' }, geometry: [{ lon: 9.493, lat: 60.472 }, { lon: 9.494, lat: 60.473 }] },
  ] };
  assert.deepEqual(parseOsmNordicRoutes(data).map((route) => route.externalId), ['relation:4']);
});

test('source geometry is clipped to 20 km and split below the activity point limit', () => {
  const coordinates = Array.from({ length: 420 }, (_value, index) => [9.48 + index * 0.00003, 60.46 + (index % 2 ? 0.001 : 0)]);
  const { candidates, rejection } = normalizeSourceLine({ sourceId: 'kartverket', externalId: 'long', name: 'Lang', coordinates });
  assert.equal(rejection, null);
  assert.ok(candidates.length >= 2);
  assert.ok(candidates.every((candidate) => candidate.geometry.coordinates.length <= 200));
  assert.ok(candidates.flatMap((candidate) => candidate.geometry.coordinates)
    .every((point) => distance(ACTIVITY_MAP_CENTER, point, { units: 'kilometers' }) <= 20.0001));
});

test('plan prefers Kartverket for confirmed overlap and keeps both source links', () => {
  const coordinates = [[9.493, 60.472], [9.494, 60.473], [9.495, 60.474]];
  const plan = buildActivityImportPlan({ runId: 'a'.repeat(32), sourceResults: [
    { sourceId: 'kartverket', rawSha256: 'b'.repeat(64), fetchedAt: '2026-10-04T10:00:00.000Z',
      lines: [{ sourceId: 'kartverket', externalId: 'ski-1', name: 'Runden (ski-1)', matchName: 'Runden', coordinates }] },
    { sourceId: 'openstreetmap', rawSha256: 'c'.repeat(64), fetchedAt: '2026-10-04T10:01:00.000Z',
      lines: [{ sourceId: 'openstreetmap', externalId: 'way:8', name: 'Runden', coordinates }] },
  ] });
  const kartverket = plan.candidates.find((candidate) => candidate.sourceId === 'kartverket');
  const osm = plan.candidates.find((candidate) => candidate.sourceId === 'openstreetmap');
  assert.equal(kartverket.status, 'new');
  assert.equal(osm.status, 'matched');
  assert.equal(osm.matchedItemId, kartverket.id);
  assert.equal(plan.summary.new, 1); assert.equal(plan.summary.matched, 1);
});

test('repeat plan detects unchanged and missing source objects without deleting them', () => {
  const coordinates = [[9.493, 60.472], [9.494, 60.473]];
  const first = buildActivityImportPlan({ runId: 'a'.repeat(32), sourceResults: [{ sourceId: 'kartverket', rawSha256: 'b'.repeat(64),
    fetchedAt: '2026-10-04T10:00:00.000Z', lines: [{ sourceId: 'kartverket', externalId: 'ski-1', name: 'Runden', coordinates }] }] });
  const current = first.candidates[0];
  const repeated = buildActivityImportPlan({ runId: 'd'.repeat(32), sourceResults: [{ sourceId: 'kartverket', rawSha256: 'b'.repeat(64),
    fetchedAt: '2026-10-04T11:00:00.000Z', lines: [{ sourceId: 'kartverket', externalId: 'ski-1', name: 'Runden', coordinates }] }],
  existingLinks: [{ source_id: 'kartverket', external_id: 'ski-1', fingerprint: current.fingerprint, feature_id: 'e'.repeat(32), feature_name: 'Runden' },
    { source_id: 'kartverket', external_id: 'ski-2', fingerprint: 'f'.repeat(64), feature_id: '1'.repeat(32), feature_name: 'Borte' }] });
  assert.equal(repeated.summary.unchanged, 1);
  assert.equal(repeated.summary.missing, 1);
  assert.equal(repeated.candidates.find((candidate) => candidate.externalId === 'ski-2').status, 'missing');
});

test('monthly activity preview is claimed once and remains pending when changes need review', async () => {
  const database = new PGlite({ extensions: { pg_trgm } });
  try {
    await database.exec(await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8'));
    const sql = neonLike(database);
    const sourceResult = { sourceId: 'kartverket', rawSha256: 'a'.repeat(64), fetchedAt: '2026-10-04T10:00:00.000Z', lines: [{
      sourceId: 'kartverket', externalId: 'monthly-test', sourceUrl: 'https://example.test/source', name: 'Månedsløypa',
      operator: 'Testlaget', coordinates: [[9.493, 60.472], [9.494, 60.473]],
    }] };
    const first = await createActivityImportPreviewCore({ action: 'preview', sourceIds: ['kartverket'] }, {
      sql, actor: 'system:monthly-activity-map', runType: 'monthly', scheduledMonth: '2026-10-01',
      idGenerator: () => '7'.repeat(32), sourceFetcher: async () => sourceResult,
    });
    assert.equal(first.status, 'preview'); assert.equal(first.runType, 'monthly'); assert.equal(first.summary.new, 1);
    const duplicate = await createActivityImportPreviewCore({ action: 'preview', sourceIds: ['kartverket'] }, {
      sql, actor: 'system:monthly-activity-map', runType: 'monthly', scheduledMonth: '2026-10-01',
      idGenerator: () => '8'.repeat(32), sourceFetcher: async () => assert.fail('A claimed month must not fetch twice'),
    });
    assert.equal(duplicate.existing, true); assert.equal(duplicate.id, first.id);
    const run = (await database.query(`SELECT run_type, scheduled_month::text, followup_completed_at
      FROM activity_map_source_runs WHERE id = $1`, [first.id])).rows[0];
    assert.deepEqual(run, { run_type: 'monthly', scheduled_month: '2026-10-01', followup_completed_at: null });
  } finally { await database.close(); }
});

function neonLike(database) {
  return {
    query: async (text, values = []) => (await database.query(text, values)).rows,
    transaction: async (build) => {
      const queued = [];
      const queries = build({ query(text, values = []) { const query = { text, values }; queued.push(query); return query; } });
      assert.equal(queries.length, queued.length);
      return database.transaction(async (transaction) => {
        const results = [];
        for (const query of queued) results.push((await transaction.query(query.text, query.values)).rows);
        return results;
      });
    },
  };
}

test('approved source candidates are stored as drafts with idempotent source links', async () => {
  const database = new PGlite({ extensions: { pg_trgm } });
  try {
    await database.exec(await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8'));
    const sql = neonLike(database);
    const ids = ['2'.repeat(32), '3'.repeat(32)];
    let sourceFailure = false;
    const sourceResult = { sourceId: 'kartverket', rawSha256: 'a'.repeat(64), fetchedAt: '2026-10-04T10:00:00.000Z', lines: [{
      sourceId: 'kartverket', externalId: 'ski-test', sourceUrl: 'https://example.test/source', name: 'Testløypa',
      operator: 'Testlaget', coordinates: [[9.493, 60.472], [9.494, 60.473]],
    }] };
    const options = { sql, actor: 'admin@example.test', idGenerator: () => ids.shift(),
      sourceFetcher: async (sourceId) => {
        assert.equal(sourceId, 'kartverket');
        if (sourceFailure) throw new MapError('errors.sourceBusy', 503);
        return sourceResult;
      } };
    const preview = await createActivityImportPreviewCore({ action: 'preview', sourceIds: ['kartverket'] }, options);
    assert.equal(preview.summary.new, 1);
    assert.equal(preview.candidates[0].geometry.type, 'LineString');
    assert.equal(Object.hasOwn(preview.candidates[0], 'sourceGeometry'), false);
    const result = await applyActivityImportCore({ action: 'apply', runId: preview.id,
      planSha256: preview.planSha256, itemIds: [preview.candidates[0].id] }, options);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), { id: preview.id, status: 'applied', imported: 1, updated: 0, linked: 0, sourcesLinked: 1 });
    const feature = (await database.query(`SELECT name, category, feature_type, is_draft, season, geometry_origin
      FROM activity_map_features WHERE id = $1`, ['3'.repeat(32)])).rows[0];
    assert.deepEqual(feature, { name: 'Testløypa', category: 'cross_country', feature_type: 'route', is_draft: true,
      season: 'winter', geometry_origin: 'external' });
    assert.equal((await database.query('SELECT count(*)::int AS count FROM activity_map_feature_sources WHERE feature_id = $1', ['3'.repeat(32)])).rows[0].count, 1);
    assert.equal((await database.query('SELECT status FROM activity_map_source_runs WHERE id = $1', [preview.id])).rows[0].status, 'applied');
    await assert.rejects(applyActivityImportCore({ action: 'apply', runId: preview.id,
      planSha256: preview.planSha256, itemIds: [preview.candidates[0].id] }, options), { code: 'errors.activityImportChanged' });
    sourceResult.lines[0].name = 'Testløypa (ski-test)';
    ids.push('4'.repeat(32));
    const changed = await createActivityImportPreviewCore({ action: 'preview', sourceIds: ['kartverket'] }, options);
    assert.equal(changed.summary.changed, 1);
    const updated = await applyActivityImportCore({ action: 'apply', runId: changed.id,
      planSha256: changed.planSha256, itemIds: [changed.candidates[0].id] }, options);
    assert.equal(updated.updated, 1);
    assert.equal((await database.query('SELECT name FROM activity_map_features WHERE id = $1', ['3'.repeat(32)])).rows[0].name,
      'Testløypa (ski-test)');
    ids.push('5'.repeat(32)); sourceFailure = true;
    await assert.rejects(createActivityImportPreviewCore({ action: 'preview', sourceIds: ['kartverket'] }, options), { code: 'errors.sourceBusy' });
    const failed = (await database.query(`SELECT status, error_code FROM activity_map_source_runs WHERE id = $1`, ['5'.repeat(32)])).rows[0];
    assert.deepEqual(failed, { status: 'failed', error_code: 'errors.sourceBusy' });
  } finally { await database.close(); }
});

test('Kartverket publishing only removes draft status from linked cross-country routes', async () => {
  const database = new PGlite({ extensions: { pg_trgm } });
  try {
    await database.exec(await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8'));
    const featureId = '6'.repeat(32);
    await database.query(`INSERT INTO activity_map_features
      (id, name, category, feature_type, geometry, is_draft, season, geometry_origin, last_changed_by)
      VALUES ($1, 'Kildeløype', 'cross_country', 'route', $2::jsonb, TRUE, 'winter', 'external', 'system:test')`,
    [featureId, JSON.stringify({ type: 'LineString', coordinates: [[9.493, 60.472], [9.494, 60.473]] })]);
    await database.query(`INSERT INTO activity_map_feature_sources
      (feature_id, source_id, external_id, source_url, fingerprint, last_changed_by)
      VALUES ($1, 'kartverket', 'gpx:test', 'https://example.test', $2, 'system:test')`, [featureId, 'a'.repeat(64)]);
    assert.deepEqual(await publishKartverketActivities(database, {
      actor: 'system:test-publish', expectedTargets: 1, expectedDrafts: 1,
    }), { targets: 1, published: 1, remainingDrafts: 0 });
    const feature = (await database.query('SELECT is_draft, version FROM activity_map_features WHERE id = $1', [featureId])).rows[0];
    assert.deepEqual(feature, { is_draft: false, version: 2 });
    assert.deepEqual(await publishKartverketActivities(database, {
      actor: 'system:test-publish', expectedTargets: 1, expectedDrafts: 0,
    }), { targets: 1, published: 0, remainingDrafts: 0 });
  } finally { await database.close(); }
});
