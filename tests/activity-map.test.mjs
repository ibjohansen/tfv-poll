import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { activityFeatureRecord, activityMatchesSeason, activityMatchesTurufjell, normalizeActivityWebsite, normalizeActivityFeatureInput, publicActivityFeatureRecord, smoothActivityGeometry } from '../lib/activity-map.js';
import { MapError } from '../lib/map/geo.js';
import { revealLeafletLayerWithoutZoom } from '../lib/map/leaflet-viewport.js';
import { activityMapIconOverrideValue, DEFAULT_ACTIVITY_CATALOG, normalizeActivityCatalogInput, normalizeActivityMapIconOverride, withActivityCatalog, withActivityMapCatalogIcon } from '../lib/activity-map-catalog.js';
import { activityMapIconAnchor, activityMapIconCoordinate, activityMapIconKind, activityMapIconMarkup } from '../lib/activity-map-icons.js';
import { downloadActivityImageSource, isPublicActivityImageAddress, normalizeActivityImageSourceUrl } from '../lib/activity-map-remote-image.js';
import { loadModule, request } from './helpers/load-module.mjs';
import { activityMapStatements, migrateActivityMapSchema } from '../scripts/release-activity-map-schema.mjs';

const polygon = { type: 'Feature', properties: { unsafe: 'discard me' }, geometry: { type: 'Polygon', coordinates: [[
  [9.493, 60.472], [9.495, 60.472], [9.495, 60.474], [9.493, 60.472],
]] } };
const hikingLine = { type: 'LineString', coordinates: [[9.493, 60.472], [9.494, 60.473], [9.495, 60.474]] };

test('selecting a visible map activity preserves the viewport and an off-screen activity only pans', () => {
  const center = { lat: 60.47, lng: 9.49 };
  const inside = { isValid: () => true, getCenter: () => center };
  let panned = null;
  const map = { getBounds: () => ({ intersects: (bounds) => bounds === inside }),
    panTo: (...args) => { panned = args; }, fitBounds: () => assert.fail('selection must not change zoom') };
  assert.equal(revealLeafletLayerWithoutZoom(map, { getBounds: () => inside }), false);
  assert.equal(panned, null);

  const outside = { isValid: () => true, getCenter: () => center };
  assert.equal(revealLeafletLayerWithoutZoom(map, { getBounds: () => outside }), true);
  assert.deepEqual(panned, [center, { animate: false }]);
});

test('Turufjell filter matches names, tooltip text and the trail-operator marker', () => {
  assert.equal(activityMatchesTurufjell({ name: 'Turufjell-runden' }), true);
  assert.equal(activityMatchesTurufjell({ name: 'Runden', tooltipText: 'Løype på Turufjell' }), true);
  assert.equal(activityMatchesTurufjell({ name: 'Runden', tooltipText: 'Prepareres av Vassfarfjellet løypelag' }), true);
  assert.equal(activityMatchesTurufjell({ name: 'Runden', tooltipText: 'Preparert skiløype' }), false);
  assert.equal(activityMatchesTurufjell({ name: 'Egen løype', sources: [] }, { includeManual: true }), true);
  assert.equal(activityMatchesTurufjell({ name: 'Importert løype', sources: [{ id: 'kartverket' }] }, { includeManual: true }), false);
  assert.equal(activityMatchesTurufjell({}), false);
});

test('activity-map icons recognize the configured activity categories and have a safe fallback', () => {
  assert.equal(activityMapIconKind({ category: 'alpine' }), 'alpine');
  assert.equal(activityMapIconKind({ category: 'cross_country' }), 'crossCountry');
  assert.equal(activityMapIconKind({ category: 'cycling' }), 'cycling');
  assert.equal(activityMapIconKind({ categoryName: 'Trening' }), 'training');
  assert.equal(activityMapIconKind({ categoryName: 'Tur' }), 'hiking');
  assert.equal(activityMapIconKind({ category: 'retail' }), 'retail');
  assert.equal(activityMapIconKind({ category: 'retail', featureSubtype: 'serving' }), 'serving');
  assert.equal(activityMapIconKind({ category: 'alpine', featureType: 'lift', featureSubtype: 'bowl_lift' }), 'bowlLift');
  assert.equal(activityMapIconKind({ category: 'alpine', featureType: 'lift', featureSubtype: 't_bar' }), 'tBar');
  assert.equal(activityMapIconKind({ category: 'alpine', featureType: 'sledding' }), 'sledding');
  assert.equal(activityMapIconKind({ category: 'alpine', featureType: 'lift', featureSubtype: 'gondola' }), 'gondola');
  assert.equal(activityMapIconKind({ category: 'parking' }), 'parking');
  assert.equal(activityMapIconKind({ category: 'wc' }), 'restroom');
  assert.equal(activityMapIconKind({ categoryName: 'Ladepunkt' }), 'evCharging');
  assert.equal(activityMapIconKind({ category: 'retail', featureType: 'point', name: 'El-bil-lading' }), 'evCharging');
  assert.equal(activityMapIconKind({ category: 'custom' }), 'generic');
  assert.match(activityMapIconMarkup({ featureSubtype: 'bowl_lift' }), /viewBox="0 0 15 15"/);
  assert.match(activityMapIconMarkup({ category: 'alpine' }), /viewBox="0 0 50 50"/);
  assert.doesNotMatch(activityMapIconMarkup({ featureSubtype: 't_bar' }), /#[0-9a-f]{3,6}/i);
});

test('activity-map labels stay on line and polygon outlines', () => {
  assert.deepEqual(activityMapIconCoordinate({ type: 'LineString', coordinates: [[0, 0], [4, 0], [4, 2]] }), [3, 0]);
  assert.deepEqual(activityMapIconCoordinate({ type: 'Polygon', coordinates: [[[0, 0], [4, 0], [4, 2], [0, 2], [0, 0]]] }), [4, 2]);
  assert.deepEqual(activityMapIconCoordinate({ type: 'Point', coordinates: [9.49, 60.47] }), [9.49, 60.47]);
  assert.deepEqual(activityMapIconAnchor({ geometry: { type: 'Point' } }), [15, 30]);
  assert.deepEqual(activityMapIconAnchor({ geometry: { type: 'LineString' } }), [15, 15]);
});

test('custom categories and types are validated from the catalog, not hardcoded enums', () => {
  const catalog = { categories: [{ id: 'winter', name: 'Vintertur', color: '#20636c' }],
    types: [{ category: 'winter', id: 'snowshoe', name: 'Truger', geometryKind: 'line' }], subtypes: [] };
  const input = { action: 'create', category: 'winter', featureType: 'snowshoe', name: 'Runden', geometry: hikingLine };
  assert.equal(normalizeActivityFeatureInput(input, catalog).geometry.type, 'LineString');
  assert.throws(() => normalizeActivityFeatureInput({ ...input, geometry: polygon }, catalog), MapError);
  assert.throws(() => normalizeActivityFeatureInput({ ...input, category: 'alpine' }, catalog), MapError);
  assert.throws(() => normalizeActivityFeatureInput({ ...input, featureType: 'trail' }, catalog), MapError);
  assert.throws(() => normalizeActivityCatalogInput({ kind: 'category', action: 'create', name: 'A', color: 'red' }), MapError);
  assert.throws(() => normalizeActivityCatalogInput({ kind: 'type', action: 'create', category: 'winter', name: 'A', geometryKind: 'Area' }), MapError);
});

test('an activity can override its automatic icon with a stored catalog icon', () => {
  const iconUrl = `/api/activity-map/icons/category/parking?v=${'a'.repeat(32)}`;
  const catalog = { ...DEFAULT_ACTIVITY_CATALOG,
    categories: DEFAULT_ACTIVITY_CATALOG.categories.map((item) => item.id === 'parking' ? { ...item, iconUrl } : item) };
  const value = activityMapIconOverrideValue('category', catalog.categories.find((item) => item.id === 'parking'));
  assert.equal(value, 'category:parking');
  assert.deepEqual(normalizeActivityMapIconOverride(value, catalog), {
    value, kind: 'category', category: 'parking', featureType: null, featureSubtype: null,
  });
  assert.equal(withActivityCatalog({ category: 'cycling', featureType: 'trail', iconOverride: value }, catalog).iconUrl, iconUrl);
  assert.throws(() => normalizeActivityMapIconOverride('category:cycling', catalog), { code: 'errors.activityIconOverride' });
  assert.throws(() => normalizeActivityMapIconOverride('unknown:parking', catalog), { code: 'errors.activityIconOverride' });
});

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
    featureSubtype: 't_bar', geometry: polygon, isDraft: false });
  assert.equal(lift.featureType, 'lift');
  assert.equal(lift.featureSubtype, 't_bar');
  assert.equal(lift.geometry.type, 'Polygon');
  const hike = normalizeActivityFeatureInput({ action: 'create', name: 'Utsiktsrunden', tooltipText: '  En fin tur med utsikt. ',
    category: 'hiking', featureType: 'route', geometry: hikingLine, isDraft: false });
  assert.equal(hike.geometry.type, 'LineString');
  assert.equal(hike.tooltipText, 'En fin tur med utsikt.');
  assert.deepEqual(hike.geometry, hikingLine);
  assert.throws(() => normalizeActivityFeatureInput({ ...lift, action: 'create', geometry: { type: 'Point', coordinates: [9.4936, 60.4723] } }), MapError);
  assert.throws(() => normalizeActivityFeatureInput({ ...hike, action: 'create', geometry: polygon }), MapError);
  assert.throws(() => normalizeActivityFeatureInput({ ...hike, action: 'create', featureType: 'trail' }), MapError);
  assert.throws(() => normalizeActivityFeatureInput({ ...hike, action: 'create', tooltipText: 'x'.repeat(301) }), MapError);
  assert.throws(() => normalizeActivityFeatureInput({ ...draft, action: 'create', isDraft: false }), MapError);
  assert.throws(() => normalizeActivityFeatureInput({ ...cycling, action: 'create', activityNumber: '2' }), MapError);
  assert.throws(() => normalizeActivityFeatureInput({ ...draft, action: 'create', activityNumber: 0 }), MapError);
  assert.throws(() => normalizeActivityFeatureInput({ ...draft, action: 'create', activityNumber: '!' }), MapError);
  assert.throws(() => normalizeActivityFeatureInput({ ...alpine, action: 'create', category: 'cycling', alpineColor: 'red' }), MapError);
  assert.throws(() => normalizeActivityFeatureInput({ ...park, action: 'create', category: 'cycling' }), MapError);
  assert.throws(() => normalizeActivityFeatureInput({ ...park, action: 'create', geometry: { type: 'Point', coordinates: [0, 0] } }), MapError);
  assert.throws(() => normalizeActivityFeatureInput({ ...lift, action: 'create', featureSubtype: 'serving' }), MapError);
});

test('activity map accepts versioned deletes and exposes only public fields', () => {
  const value = normalizeActivityFeatureInput({ action: 'delete', id: 'a'.repeat(32), version: 3 });
  assert.deepEqual(value, { action: 'delete', id: 'a'.repeat(32), version: 3 });
  const row = { id: 'b'.repeat(32), name: 'Blåløypa', category: 'alpine', feature_type: 'trail',
    tooltip_text: 'Kort omtale', activity_number: '4A', alpine_color: 'blue', feature_subtype: null, geometry: JSON.stringify(polygon.geometry), is_draft: true, version: '2',
    icon_override_kind: 'category', icon_override_category: 'parking', override_icon_key: `activity-map/icons/${'d'.repeat(32)}.svg`,
    image_storage_key: `activity-map/images/${'b'.repeat(32)}/${'c'.repeat(32)}.webp`, image_source_url: 'https://images.example.test/trail.jpg',
    source_ids: ['kartverket', 'not-allowed'], last_changed_by: 'private@example.test' };
  const publicResult = publicActivityFeatureRecord(row);
  assert.deepEqual(Object.keys(publicResult).sort(), ['activityNumber', 'alpineColor', 'category', 'categoryName', 'categoryColor', 'typeName', 'subtypeName', 'geometryKind', 'featureType', 'featureSubtype', 'geometry', 'iconUrl', 'imageUrl', 'id', 'name', 'tooltipText', 'season', 'websiteUrl', 'sources'].sort());
  assert.equal(publicResult.tooltipText, 'Kort omtale');
  assert.equal(publicResult.imageUrl, `/api/activity-map/images/${'b'.repeat(32)}?v=${'c'.repeat(32)}`);
  assert.equal(publicResult.iconUrl, `/api/activity-map/icons/category/parking?v=${'d'.repeat(32)}`);
  assert.deepEqual(publicResult.sources.map((source) => source.id), ['kartverket']);
  assert.equal(Object.hasOwn(publicResult.sources[0], 'priority'), false);
  assert.doesNotMatch(JSON.stringify(publicResult), /private@example|version|isDraft/);
  assert.equal(activityFeatureRecord(row).version, 2); assert.equal(activityFeatureRecord(row).isDraft, true);
  assert.equal(activityFeatureRecord(row).imageSourceUrl, 'https://images.example.test/trail.jpg');
  assert.equal(activityFeatureRecord(row).iconOverride, 'category:parking');
  assert.doesNotMatch(JSON.stringify(publicResult), /image_storage_key|images\.example/);
});

test('remote activity images require a public HTTPS host and bounded supported image data', async () => {
  assert.equal(normalizeActivityImageSourceUrl('https://images.example.test/trail.jpg#crop'), 'https://images.example.test/trail.jpg');
  for (const url of ['http://images.example.test/trail.jpg', 'https://localhost/trail.jpg', 'https://user:pass@example.test/a.jpg', 'https://example.test:8443/a.jpg']) {
    assert.throws(() => normalizeActivityImageSourceUrl(url), /Invalid activity image URL/);
  }
  for (const address of ['127.0.0.1', '10.0.0.2', '169.254.169.254', '192.168.1.4', '::1', 'fd00::1', 'fe80::1', '::ffff:7f00:1']) {
    assert.equal(isPublicActivityImageAddress(address), false);
  }
  assert.equal(isPublicActivityImageAddress('93.184.216.34'), true);
  assert.equal(isPublicActivityImageAddress('2606:2800:220:1:248:1893:25c8:1946'), true);
  const downloaded = await downloadActivityImageSource('https://images.example.test/trail.png', {
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl: async () => new Response(Buffer.from('89504e470d0a1a0a', 'hex'), { headers: { 'Content-Type': 'image/png' } }),
  });
  assert.equal(downloaded.sourceUrl, 'https://images.example.test/trail.png');
  assert.equal(downloaded.file.name, 'remote-image.png');
  assert.equal(downloaded.file.size, 8);
  await assert.rejects(downloadActivityImageSource('https://internal.example.test/image.png', {
    lookup: async () => [{ address: '10.0.0.4', family: 4 }],
    fetchImpl: async () => assert.fail('Private hosts must be rejected before fetch'),
  }), /Invalid activity image URL/);
});

test('public activity polygons are smoothed without changing stored geometry or points', () => {
  const geometry = polygon.geometry;
  const original = structuredClone(geometry);
  const smoothed = smoothActivityGeometry(geometry);
  assert.equal(smoothed.type, 'Polygon');
  assert.ok(smoothed.coordinates[0].length > geometry.coordinates[0].length);
  assert.deepEqual(smoothed.coordinates[0][0], smoothed.coordinates[0].at(-1));
  assert.deepEqual(geometry, original);
  const point = { type: 'Point', coordinates: [9.4936, 60.4723] };
  assert.equal(smoothActivityGeometry(point), point);
});

test('activity map service performs audited, versioned create, update and soft delete', async () => {
  const calls = [];
  const sql = { query: async (text, values = []) => {
    calls.push({ text, values });
    if (text.startsWith('INSERT')) return [{ id: 'c'.repeat(32), name: values[1], tooltip_text: values[2], category: values[3], activity_number: values[4], feature_type: values[5], feature_subtype: values[6],
      alpine_color: values[7], geometry: values[8], is_draft: values[9], season: values[11], website_url: values[12], version: 1 }];
    if (text.startsWith('UPDATE activity_map_features SET name')) return [{ id: 'c'.repeat(32), name: values[0], tooltip_text: values[1], category: values[2], activity_number: values[3], feature_type: values[4],
      feature_subtype: values[5], alpine_color: values[6], geometry: values[7], is_draft: values[8], season: values[12], website_url: values[13], version: 2 }];
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
    './activity-map-catalog-service.js': { getActivityMapCatalog: async () => DEFAULT_ACTIVITY_CATALOG },
    './activity-map-catalog.js': { withActivityCatalog },
  });
  const created = await service.saveActivityMapFeature({ action: 'create', name: 'Test', category: 'cycling', featureType: 'trail', geometry: polygon, isDraft: false, season: 'summer', websiteUrl: 'https://example.test/cycle' });
  assert.equal(created.season, 'summer'); assert.equal(created.websiteUrl, 'https://example.test/cycle');
  const updated = await service.saveActivityMapFeature({ action: 'update', id: 'c'.repeat(32), version: 1, name: 'Test 2', category: 'alpine', activityNumber: '7A', featureType: 'trail', alpineColor: 'red', geometry: polygon, isDraft: false, season: 'winter', websiteUrl: 'https://example.test/alpine' });
  assert.equal(updated.season, 'winter'); assert.equal(updated.websiteUrl, 'https://example.test/alpine');
  await service.saveActivityMapFeature({ action: 'delete', id: 'c'.repeat(32), version: 2 });
  await service.getPublicActivityMapFeatures();
  assert.match(calls[0].text, /last_changed_by/); assert.equal(calls[0].values[10], 'admin@example.test');
  assert.match(calls[1].text, /version = \$12/); assert.equal(calls[1].values[11], 1);
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
    '@/lib/activity-map-catalog-service': { getActivityMapCatalog: async () => DEFAULT_ACTIVITY_CATALOG },
    '@/lib/map/api': { handleMapRequest }, '@/lib/activity-map-service': {
      getAdminActivityMapFeatures: async () => [], saveActivityMapFeature: async () => ({ id: 'a'.repeat(32) }),
    },
  });
  const get = await route.GET(request('/api/admin/activity-map/features'));
  assert.equal(get.status, 200); assert.match(get.headers.get('Cache-Control'), /private/);
  const crossSite = await route.POST(request('/api/admin/activity-map/features', { method: 'POST', body: { action: 'create' }, headers: { origin: 'https://evil.test' } }));
  assert.equal(crossSite.status, 403);
  let catalogWrites = 0;
  const catalogRoute = await loadModule('app/api/admin/activity-map/catalog/route.js', {
    '@/lib/map/api': { handleMapRequest }, '@/lib/activity-map-catalog-service': { saveActivityMapCatalogEntry: async () => { catalogWrites++; return DEFAULT_ACTIVITY_CATALOG; } },
  });
  assert.equal((await catalogRoute.POST(request('/api/admin/activity-map/catalog', { method: 'POST', body: {}, headers: { origin: 'https://evil.test' } }))).status, 403);
  assert.equal(catalogWrites, 0);
  const allowed = await catalogRoute.POST(request('/api/admin/activity-map/catalog', { method: 'POST', body: {} }));
  assert.equal(allowed.status, 200); assert.match(allowed.headers.get('Cache-Control'), /private/);

  let imageImports = 0;
  const imageRoute = await loadModule('app/api/admin/activity-map/features/image/route.js', {
    '@/lib/activity-map-image-service': {
      uploadActivityMapImage: async () => assert.fail('Unexpected file upload'),
      importActivityMapImage: async ({ id }, sourceUrl) => { imageImports++; return { id, imageUrl: sourceUrl }; },
      removeActivityMapImage: async ({ id }) => ({ id, imageUrl: null }),
    },
  });
  const imageForm = new FormData();
  imageForm.set('id', 'a'.repeat(32)); imageForm.set('version', '1'); imageForm.set('sourceUrl', 'https://images.example.test/test.jpg');
  const blockedImage = await imageRoute.POST(new Request('https://example.test/api/admin/activity-map/features/image', {
    method: 'POST', headers: { Origin: 'https://evil.test' }, body: imageForm,
  }));
  assert.equal(blockedImage.status, 403); assert.equal(imageImports, 0);
  const importedImage = await imageRoute.POST(new Request('https://example.test/api/admin/activity-map/features/image', {
    method: 'POST', headers: { Origin: 'https://example.test' }, body: imageForm,
  }));
  assert.equal(importedImage.status, 201); assert.equal(imageImports, 1); assert.match(importedImage.headers.get('Cache-Control'), /private/);

  const publicImageRoute = await loadModule('app/api/activity-map/images/[id]/route.js', {
    '@/lib/activity-map-image-service': {
      getActivityMapImage: async () => ({ storageKey: `activity-map/images/${'a'.repeat(32)}/${'b'.repeat(32)}.webp`, mimeType: 'image/webp', size: 3, isPublic: true }),
      downloadActivityMapImage: async () => ({ Body: { transformToByteArray: async () => Uint8Array.from([1, 2, 3]) } }),
    },
  });
  const publicImage = await publicImageRoute.GET(request(`/api/activity-map/images/${'a'.repeat(32)}?v=${'b'.repeat(32)}`), { params: Promise.resolve({ id: 'a'.repeat(32) }) });
  assert.equal(publicImage.status, 200); assert.equal(publicImage.headers.get('Content-Type'), 'image/webp');
  assert.match(publicImage.headers.get('Cache-Control'), /immutable/); assert.equal(publicImage.headers.get('X-Content-Type-Options'), 'nosniff');

  let previews = 0;
  const importRoute = await loadModule('app/api/admin/activity-map/import/route.js', {
    '@/lib/map/api': { handleMapRequest }, '@/lib/map/errors': { MapError },
    '@/lib/activity-map-import-service': {
      getActivityImportRuns: async () => [], getActivityImportRun: async (id) => ({ id }),
      applyActivityImport: async () => ({}), rejectActivityImportItems: async () => ({}), completeActivityImportFollowup: async () => ({}),
      createActivityImportPreview: async () => { previews += 1; return { id: 'b'.repeat(32) }; },
    },
  });
  assert.equal(importRoute.maxDuration, 60);
  const blockedImport = await importRoute.POST(request('/api/admin/activity-map/import', { method: 'POST', body: { action: 'preview' }, headers: { origin: 'https://evil.test' } }));
  assert.equal(blockedImport.status, 403); assert.equal(previews, 0);
  const preview = await importRoute.POST(request('/api/admin/activity-map/import', { method: 'POST', body: { action: 'preview' } }));
  assert.equal(preview.status, 200); assert.equal(previews, 1); assert.match(preview.headers.get('Cache-Control'), /private/);
  const stored = await importRoute.GET(request(`/api/admin/activity-map/import?run=${'c'.repeat(32)}`));
  assert.equal((await stored.json()).run.id, 'c'.repeat(32));
});

test('database schema constrains activity map combinations and adds audit triggers', async () => {
  const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS activity_map_features/);
  assert.match(schema, /FOREIGN KEY \(category, feature_type\) REFERENCES activity_map_types/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS activity_map_categories/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS activity_map_subtypes/);
  assert.match(schema, /feature_subtype TEXT/);
  assert.match(schema, /tooltip_text TEXT/);
  assert.match(schema, /image_storage_key TEXT/);
  assert.match(schema, /activity_map_feature_image_check/);
  assert.match(schema, /activity_map_feature_icon_override_check/);
  assert.match(schema, /activity_map_feature_icon_override_subtype_fk/);
  assert.match(schema, /old_data := old_data - 'image_storage_key'/);
  assert.match(schema, /activity_number TEXT/);
  assert.match(schema, /ALTER COLUMN activity_number TYPE TEXT USING activity_number::TEXT/);
  assert.match(schema, /CHECK \(is_draft OR \(geometry IS NOT NULL AND geometry <> 'null'::jsonb\)\)/);
  assert.match(schema, /activity_map_feature_combination_check/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS activity_map_sources/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS activity_map_source_runs/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS activity_map_source_items/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS activity_map_feature_sources/);
  assert.match(schema, /'cross_country', 'Langrenn', '#2f6fb0'/);
  assert.match(schema, /geometry_origin IN \('manual', 'external'\)/);
  assert.match(schema, /activity_map_features_audit_trigger/);
  for (const name of ['Slåtteliløypa', 'Furuløypa', 'Dompappen', 'Blåbærløypa', 'Grønnfinken', 'Rødreven',
    'Høgseterløypa', 'Harahopp', 'Plogen', 'Trollskogen', 'Eventyrskogen']) assert.match(schema, new RegExp(name));
});

test('activity map on the public home page loads published features without a query parameter', async () => {
  const homePage = await readFile(new URL('../app/page.js', import.meta.url), 'utf8');
  const publicHome = await readFile(new URL('../components/PublicHomePage.js', import.meta.url), 'utf8');
  assert.match(homePage, /safely\(getCachedPublicActivityMapFeatures\(\), \[\]\)/);
  assert.doesNotMatch(homePage, /maps === 'turutrollet'/);
  assert.match(publicHome, /activityMapFeatures !== null && <PublicActivityMap/);
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
      (id, name, category, feature_type, feature_subtype, geometry, is_draft)
      VALUES ($1, 'Testheis', 'alpine', 'lift', 't_bar', $2::jsonb, FALSE)`, ['e'.repeat(32), JSON.stringify(polygon.geometry)]);
    await assert.rejects(database.query(`INSERT INTO activity_map_features
      (id, name, category, feature_type, feature_subtype, geometry, is_draft)
      VALUES ($1, 'Feil undertype', 'alpine', 'lift', 'serving', $2::jsonb, FALSE)`,
    ['1'.repeat(32), JSON.stringify(polygon.geometry)]));
    await assert.rejects(database.query(`INSERT INTO activity_map_features
      (id, name, category, feature_type, geometry, is_draft)
      VALUES ($1, 'Ugyldig testheis', 'alpine', 'lift', $2::jsonb, FALSE)`,
    ['f'.repeat(32), JSON.stringify({ type: 'Point', coordinates: [9.4936, 60.4723] })]));
    await database.query(`INSERT INTO activity_map_features
      (id, name, category, activity_number, feature_type, geometry, is_draft)
      VALUES ($1, 'Bokstavbakken', 'alpine', 'A1', 'trail', $2::jsonb, FALSE)`,
    ['d'.repeat(32), JSON.stringify(polygon.geometry)]);
    await database.query(`INSERT INTO activity_map_features
      (id, name, tooltip_text, category, feature_type, geometry, is_draft)
      VALUES ($1, 'Utsiktsrunden', 'Kort omtale', 'hiking', 'route', $2::jsonb, FALSE)`,
    ['c'.repeat(32), JSON.stringify(hikingLine)]);
    await assert.rejects(database.query(`INSERT INTO activity_map_features
      (id, name, category, feature_type, geometry, is_draft)
      VALUES ($1, 'Ugyldig tur', 'hiking', 'route', $2::jsonb, FALSE)`,
    ['b'.repeat(32), JSON.stringify(polygon.geometry)]));

    let nextId = 0;
    let invalidations = 0;
    const service = await loadModule('lib/activity-map-catalog-service.js', {
      './admin-access.js': { requirePermission: async (permission) => { assert.equal(permission, 'members'); return { email: 'ADMIN@EXAMPLE.TEST' }; } },
      './db.js': { getSql: () => ({ query: async (...args) => (await database.query(...args)).rows }) },
      './mock-store.js': { isMockMode: () => false }, './member-self-service-utils.js': { randomId: () => `custom-${++nextId}` },
      './public-content-cache.js': { revalidatePublicActivityMap: () => { invalidations++; } },
      './activity-map-catalog.js': { DEFAULT_ACTIVITY_CATALOG, normalizeActivityCatalogInput, withActivityMapCatalogIcon }, './map/geo.js': { MapError },
    });
    const categoryInput = { kind: 'category', action: 'create', name: 'Vintertur', color: '#20636c' };
    let catalog = await service.saveActivityMapCatalogEntry(categoryInput);
    const category = catalog.categories.find((item) => item.name === 'Vintertur');
    catalog = await service.saveActivityMapCatalogEntry({ kind: 'type', action: 'create', category: category.id, name: 'Truger', geometryKind: 'line' });
    const type = catalog.types.find((item) => item.name === 'Truger');
    await database.query(`INSERT INTO activity_map_features (id, name, category, feature_type, geometry, is_draft)
      VALUES ($1, 'Trugerunden', $2, $3, $4::jsonb, FALSE)`, ['a'.repeat(32), category.id, type.id, JSON.stringify(hikingLine)]);
    await assert.rejects(service.saveActivityMapCatalogEntry({ ...categoryInput, name: 'vintertur' }), { code: 'errors.activityCatalogDuplicate' });
    await assert.rejects(service.saveActivityMapCatalogEntry({ kind: 'type', action: 'create', category: 'missing', name: 'Feil', geometryKind: 'point' }), { code: 'errors.activityCategory' });
    await service.saveActivityMapCatalogEntry({ ...category, kind: 'category', action: 'update', name: 'Vinteraktiviteter' });
    await assert.rejects(service.saveActivityMapCatalogEntry({ ...category, kind: 'category', action: 'update', name: 'Gammelt navn' }), { code: 'errors.activityCatalogChanged' });
    await service.saveActivityMapCatalogEntry({ ...type, kind: 'type', action: 'update', name: 'Trugetur' });
    await assert.rejects(service.saveActivityMapCatalogEntry({ ...type, kind: 'type', action: 'update', geometryKind: 'polygon' }), { code: 'errors.activityCatalogChanged' });
    await assert.rejects(database.query(`UPDATE activity_map_types SET geometry_kind = 'polygon' WHERE category = $1 AND id = $2`, [category.id, type.id]));
    await assert.rejects(database.query(`UPDATE activity_map_features SET feature_type = 'trail' WHERE id = $1`, ['a'.repeat(32)]));
    // A legacy draft used JSON null instead of SQL NULL. Preserve it without publishing it.
    await database.query(`INSERT INTO activity_map_features (id, name, category, feature_type, geometry, is_draft)
      VALUES ($1, 'Eldre kladd', 'alpine', 'trail', 'null'::jsonb, TRUE)`, ['9'.repeat(32)]);
    await assert.rejects(database.query('UPDATE activity_map_features SET is_draft = FALSE WHERE id = $1', ['9'.repeat(32)]));
    const before = (await database.query('SELECT * FROM activity_map_features ORDER BY id')).rows;
    assert.ok(activityMapStatements(schema).every((statement) => !/ALTER TABLE (members|surveys)\b/.test(statement)));
    const migration = await migrateActivityMapSchema(database, schema);
    assert.equal(migration.activitiesPreserved, before.length);
    assert.deepEqual((await database.query('SELECT * FROM activity_map_features ORDER BY id')).rows, before);
    catalog = await service.getActivityMapCatalog();
    assert.equal(catalog.categories.find((item) => item.id === category.id).name, 'Vinteraktiviteter');
    assert.equal(catalog.types.find((item) => item.id === type.id).name, 'Trugetur');
    assert.equal(catalog.subtypes.find((item) => item.id === 't_bar')?.name, 'T-krok');
    assert.equal(invalidations, 4);
    await database.query('UPDATE activity_map_categories SET icon_key = $1 WHERE id = $2',
      [`activity-map/icons/${'7'.repeat(32)}.svg`, category.id]);
    catalog = await service.getActivityMapCatalog();
    const iconOverride = activityMapIconOverrideValue('category', catalog.categories.find((item) => item.id === category.id));
    const featureService = await loadModule('lib/activity-map-service.js', {
      './admin-access.js': { requirePermission: async () => ({ email: 'admin@example.test' }) },
      './db.js': { getSql: () => ({ query: async (...args) => (await database.query(...args)).rows }) },
      './mock-store.js': { isMockMode: () => false }, './member-self-service-utils.js': { randomId: () => '8'.repeat(32) },
      './public-content-cache.js': { revalidatePublicActivityMap: () => {} },
      './activity-map.js': { activityFeatureRecord, normalizeActivityFeatureInput, publicActivityFeatureRecord }, './map/geo.js': { MapError },
      './activity-map-catalog-service.js': { getActivityMapCatalog: service.getActivityMapCatalog }, './activity-map-catalog.js': { withActivityCatalog },
    });
    const created = await featureService.saveActivityMapFeature({ action: 'create', name: 'Ny runde', category: category.id, featureType: type.id, geometry: hikingLine,
      season: 'summer', websiteUrl: 'https://example.test/aktiviteter', iconOverride });
    assert.equal(created.categoryName, 'Vinteraktiviteter'); assert.equal(created.typeName, 'Trugetur');
    assert.equal(created.season, 'summer'); assert.equal(created.websiteUrl, 'https://example.test/aktiviteter');
    assert.equal(created.iconOverride, iconOverride);
    assert.equal(created.iconUrl, `/api/activity-map/icons/category/${category.id}?v=${'7'.repeat(32)}`);
    const updated = await featureService.saveActivityMapFeature({ ...created, action: 'update', season: 'all_year', websiteUrl: 'https://example.test/helars' });
    assert.equal(updated.version, created.version + 1);
    // Exercise the real INSERT, UPDATE and both SELECTs, not a mock that echoes inputs.
    const reloaded = (await featureService.getAdminActivityMapFeatures()).find((item) => item.id === created.id);
    assert.equal(reloaded.season, 'all_year'); assert.equal(reloaded.websiteUrl, 'https://example.test/helars');
    assert.equal(reloaded.iconOverride, iconOverride); assert.equal(reloaded.iconUrl, created.iconUrl);
    const publicFeatures = await featureService.getPublicActivityMapFeatures();
    assert.equal(publicFeatures.find((item) => item.id === created.id).geometryKind, 'line');
    assert.equal(publicFeatures.find((item) => item.id === created.id).season, 'all_year');
    assert.equal(publicFeatures.find((item) => item.id === created.id).websiteUrl, 'https://example.test/helars');
    await featureService.saveActivityMapFeature({ ...updated, action: 'update', season: null, websiteUrl: null });
    const cleared = (await featureService.getAdminActivityMapFeatures()).find((item) => item.id === created.id);
    assert.equal(cleared.season, null); assert.equal(cleared.websiteUrl, null);
    assert.equal(publicFeatures.some((item) => item.id === '9'.repeat(32)), false);
    assert.equal((await featureService.getAdminActivityMapFeatures()).find((item) => item.id === created.id).categoryColor, '#20636c');
    const audit = (await database.query(`SELECT changed_by, row_id FROM audit_log WHERE table_name = 'activity_map_types' AND operation = 'UPDATE'`)).rows;
    assert.deepEqual(audit, [{ changed_by: 'admin@example.test', row_id: `${category.id}:${type.id}` }]);
  } finally { await database.close(); }
});
