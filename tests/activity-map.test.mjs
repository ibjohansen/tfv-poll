import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { activityFeatureRecord, activityGeometryKind, normalizeActivityFeatureInput, publicActivityFeatureRecord } from '../lib/activity-map.js';
import { MapError } from '../lib/map/geo.js';
import { loadModule, request } from './helpers/load-module.mjs';

const polygon = { type: 'Feature', properties: { unsafe: 'discard me' }, geometry: { type: 'Polygon', coordinates: [[
  [9.493, 60.472], [9.495, 60.472], [9.495, 60.474], [9.493, 60.472],
]] } };

test('activity map validates category, geometry and alpine metadata', () => {
  const cycling = normalizeActivityFeatureInput({ action: 'create', name: '  Rundløypa  ', category: 'cycling', featureType: 'trail', geometry: polygon });
  assert.equal(cycling.name, 'Rundløypa');
  assert.equal(cycling.alpineColor, null);
  assert.deepEqual(cycling.geometry, polygon.geometry);
  assert.equal(Object.hasOwn(cycling.geometry, 'properties'), false);

  const park = normalizeActivityFeatureInput({ action: 'create', name: 'Terrengpark', category: 'alpine', featureType: 'park',
    geometry: { type: 'Point', coordinates: [9.4936, 60.4723] } });
  assert.equal(park.featureType, 'park');
  assert.equal(park.alpineColor, null);

  const alpine = normalizeActivityFeatureInput({ action: 'create', name: 'Familiebakken', category: 'alpine', featureType: 'trail', alpineColor: 'green', geometry: polygon });
  assert.equal(alpine.alpineColor, 'green');
  const draft = normalizeActivityFeatureInput({ action: 'create', name: 'Slåtteliløypa', category: 'alpine', activityNumber: ' 1A ',
    featureType: 'trail', alpineColor: 'blue', geometry: null, isDraft: true });
  assert.equal(draft.activityNumber, '1A'); assert.equal(draft.geometry, null); assert.equal(draft.isDraft, true);
  const lift = normalizeActivityFeatureInput({ action: 'create', name: 'Testheis', category: 'alpine', featureType: 'lift',
    geometry: polygon, isDraft: false });
  assert.equal(lift.featureType, 'lift');
  assert.equal(activityGeometryKind('lift'), 'polygon');
  assert.throws(() => normalizeActivityFeatureInput({ ...lift, action: 'create', geometry: { type: 'Point', coordinates: [9.4936, 60.4723] } }), MapError);
  assert.throws(() => normalizeActivityFeatureInput({ ...draft, action: 'create', isDraft: false }), MapError);
  assert.throws(() => normalizeActivityFeatureInput({ ...cycling, action: 'create', activityNumber: '2' }), MapError);
  assert.throws(() => normalizeActivityFeatureInput({ ...draft, action: 'create', activityNumber: 0 }), MapError);
  assert.throws(() => normalizeActivityFeatureInput({ ...draft, action: 'create', activityNumber: '!' }), MapError);
  assert.throws(() => normalizeActivityFeatureInput({ ...alpine, action: 'create', category: 'cycling', alpineColor: 'red' }), MapError);
  assert.throws(() => normalizeActivityFeatureInput({ ...park, action: 'create', category: 'cycling' }), MapError);
  assert.throws(() => normalizeActivityFeatureInput({ ...park, action: 'create', geometry: { type: 'Point', coordinates: [0, 0] } }), MapError);
});

test('activity map accepts versioned deletes and exposes only public fields', () => {
  const value = normalizeActivityFeatureInput({ action: 'delete', id: 'a'.repeat(32), version: 3 });
  assert.deepEqual(value, { action: 'delete', id: 'a'.repeat(32), version: 3 });
  const row = { id: 'b'.repeat(32), name: 'Blåløypa', category: 'alpine', feature_type: 'trail',
    activity_number: '4A', alpine_color: 'blue', geometry: JSON.stringify(polygon.geometry), is_draft: true, version: '2', last_changed_by: 'private@example.test' };
  const publicResult = publicActivityFeatureRecord(row);
  assert.deepEqual(Object.keys(publicResult).sort(), ['activityNumber', 'alpineColor', 'category', 'featureType', 'geometry', 'id', 'name'].sort());
  assert.doesNotMatch(JSON.stringify(publicResult), /private@example|version|isDraft/);
  assert.equal(activityFeatureRecord(row).version, 2); assert.equal(activityFeatureRecord(row).isDraft, true);
});

test('activity map service performs audited, versioned create, update and soft delete', async () => {
  const calls = [];
  const sql = { query: async (text, values = []) => {
    calls.push({ text, values });
    if (text.startsWith('INSERT')) return [{ id: 'c'.repeat(32), name: values[1], category: values[2], activity_number: values[3], feature_type: values[4],
      alpine_color: values[5], geometry: values[6], is_draft: values[7], version: 1 }];
    if (text.startsWith('UPDATE activity_map_features SET name')) return [{ id: 'c'.repeat(32), name: values[0], category: values[1], activity_number: values[2], feature_type: values[3],
      alpine_color: values[4], geometry: values[5], is_draft: values[6], version: 2 }];
    if (text.startsWith('SELECT')) return [];
    return [{ id: 'c'.repeat(32), name: 'Test 2', category: 'alpine', activity_number: '7A', feature_type: 'trail', alpine_color: 'red', geometry: polygon.geometry, is_draft: false, version: 3 }];
  } };
  let invalidated = 0;
  const service = await loadModule('lib/activity-map-service.js', {
    './admin-access.js': { requirePermission: async (permission) => { assert.equal(permission, 'members'); return { email: 'ADMIN@EXAMPLE.TEST' }; } },
    './db.js': { getSql: () => sql }, './mock-store.js': { isMockMode: () => false },
    './member-self-service-utils.js': { randomId: () => 'c'.repeat(32) },
    './public-content-cache.js': { revalidatePublicActivityMap: () => { invalidated += 1; } },
    './activity-map.js': { activityFeatureRecord, normalizeActivityFeatureInput, publicActivityFeatureRecord }, './map/geo.js': { MapError },
  });
  await service.saveActivityMapFeature({ action: 'create', name: 'Test', category: 'cycling', featureType: 'trail', geometry: polygon, isDraft: false });
  await service.saveActivityMapFeature({ action: 'update', id: 'c'.repeat(32), version: 1, name: 'Test 2', category: 'alpine', activityNumber: '7A', featureType: 'trail', alpineColor: 'red', geometry: polygon, isDraft: false });
  await service.saveActivityMapFeature({ action: 'delete', id: 'c'.repeat(32), version: 2 });
  await service.getPublicActivityMapFeatures();
  assert.match(calls[0].text, /last_changed_by/); assert.equal(calls[0].values.at(-1), 'admin@example.test');
  assert.match(calls[1].text, /version = \$10/); assert.equal(calls[1].values[9], 1);
  assert.match(calls[2].text, /deleted_at = NOW\(\)/); assert.equal(calls[2].values[2], 2);
  assert.match(calls[3].text, /is_draft = FALSE AND geometry IS NOT NULL/);
  assert.equal(invalidated, 3);
});

test('activity map admin route inherits authentication, same-origin and private-cache controls', async () => {
  const { handleMapRequest } = await loadModule('lib/map/api.js', {
    '../admin-access.js': { requirePermission: async () => ({ email: 'admin@example.test' }) },
    '../rate-limit.js': { isRateLimited: () => false }, '../i18n/request.js': { getRequestI18n: () => ({ locale: 'nb', t: (key, values, fallback) => fallback || key }) },
    './geo.js': { MapError }, './http.js': { readLimitedJson: async (response) => response.json() },
  });
  const route = await loadModule('app/api/admin/activity-map/features/route.js', {
    '@/lib/map/api': { handleMapRequest }, '@/lib/activity-map-service': {
      getAdminActivityMapFeatures: async () => [], saveActivityMapFeature: async () => ({ id: 'a'.repeat(32) }),
    },
  });
  const get = await route.GET(request('/api/admin/activity-map/features'));
  assert.equal(get.status, 200); assert.match(get.headers.get('Cache-Control'), /private/);
  const crossSite = await route.POST(request('/api/admin/activity-map/features', { method: 'POST', body: { action: 'create' }, headers: { origin: 'https://evil.test' } }));
  assert.equal(crossSite.status, 403);
});

test('database schema constrains activity map combinations and adds audit triggers', async () => {
  const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS activity_map_features/);
  assert.match(schema, /category IN \('cycling', 'alpine'\)/);
  assert.match(schema, /feature_type IN \('trail', 'park', 'sledding', 'lift'\)/);
  assert.match(schema, /activity_number TEXT/);
  assert.match(schema, /ALTER COLUMN activity_number TYPE TEXT USING activity_number::TEXT/);
  assert.match(schema, /CHECK \(is_draft OR geometry IS NOT NULL\)/);
  assert.match(schema, /activity_map_feature_combination_check/);
  assert.match(schema, /activity_map_features_audit_trigger/);
  for (const name of ['Slåtteliløypa', 'Furuløypa', 'Dompappen', 'Blåbærløypa', 'Grønnfinken', 'Rødreven',
    'Høgseterløypa', 'Harahopp', 'Plogen', 'Trollskogen', 'Eventyrskogen']) assert.match(schema, new RegExp(name));
});

test('activity map remains disabled on the public home page', async () => {
  const homePage = await readFile(new URL('../app/page.js', import.meta.url), 'utf8');
  const publicHome = await readFile(new URL('../components/PublicHomePage.js', import.meta.url), 'utf8');
  assert.doesNotMatch(homePage, /activity-map-service|ActivityMap/);
  assert.doesNotMatch(publicHome, /PublicActivityMap/);
});

test('database schema seeds the requested alpine drafts idempotently', async () => {
  const database = new PGlite({ extensions: { pg_trgm } });
  try {
    const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
    await database.exec(schema); await database.exec(schema);
    const { rows } = await database.query(`SELECT name, activity_number, alpine_color, feature_type, geometry, is_draft
      FROM activity_map_features ORDER BY activity_number, lower(name)`);
    assert.equal(rows.length, 11);
    assert.ok(rows.every((row) => row.feature_type === 'trail' && row.geometry === null && row.is_draft === true));
    assert.deepEqual(rows.filter((row) => row.activity_number === '5').map((row) => row.name).sort(), ['Grønnfinken', 'Harahopp']);
    assert.deepEqual(rows.find((row) => row.name === 'Slåtteliløypa'), {
      name: 'Slåtteliløypa', activity_number: '1', alpine_color: 'blue', feature_type: 'trail', geometry: null, is_draft: true,
    });
    assert.equal((await database.query(`SELECT count(*)::int AS count FROM activity_map_features
      WHERE is_draft = FALSE AND geometry IS NOT NULL`)).rows[0].count, 0);
    await database.query(`INSERT INTO activity_map_features
      (id, name, category, feature_type, geometry, is_draft)
      VALUES ($1, 'Testheis', 'alpine', 'lift', $2::jsonb, FALSE)`, ['e'.repeat(32), JSON.stringify(polygon.geometry)]);
    await assert.rejects(database.query(`INSERT INTO activity_map_features
      (id, name, category, feature_type, geometry, is_draft)
      VALUES ($1, 'Ugyldig testheis', 'alpine', 'lift', $2::jsonb, FALSE)`,
    ['f'.repeat(32), JSON.stringify({ type: 'Point', coordinates: [9.4936, 60.4723] })]));
    await database.query(`INSERT INTO activity_map_features
      (id, name, category, activity_number, feature_type, geometry, is_draft)
      VALUES ($1, 'Bokstavbakken', 'alpine', 'A1', 'trail', $2::jsonb, FALSE)`,
    ['d'.repeat(32), JSON.stringify(polygon.geometry)]);
  } finally { await database.close(); }
});
