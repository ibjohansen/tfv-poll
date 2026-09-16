import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, plain, request, routeContext } from './helpers/load-module.mjs';
import { MapError } from '../lib/map/geo.js';
import { normalizeAddress, normalizeCadastral, propertyLabel } from '../lib/map/normalization.js';

async function publicService() {
  return loadModule('lib/map/public-map-service.js', {
    '../db.js': { getSql: () => { throw new Error('Database must not be used by projection test'); } },
    '../mock-store.js': { isMockMode: () => false },
    './cache.js': { createMapCache: () => async (_key, loader) => loader() },
    './geo.js': { MapError }, './hamlets.js': { hamletRecord: (row) => row },
    './kartverket-address-service.js': { findAddressesInPolygon: async () => ({ addresses: [] }) },
    './kartverket-boundary-service.js': { findPropertiesInPolygon: async () => ({ boundaries: [], complete: true }) },
    './normalization.js': { normalizeAddress, normalizeCadastral, propertyLabel },
  }, { Intl });
}

test('public property projection exposes only requested property fields and uses unambiguous official coordinates', async () => {
  const { normalizePublicProperties } = await publicService();
  const rows = [{ id: '91', h_number: 'H242', cadastral_number: '10/524', street_address: 'Øvre Sprenåsen 37',
    primary_contact_name: 'Skal ikke ut', primary_contact_email: 'private@example.test', title_holder: 'Skal ikke ut' }];
  const addresses = [{ id: 'official-1', address: 'øvre sprenåsen 37', gnr: 10, bnr: 524, fnr: null, snr: null,
    latitude: 60.401, longitude: 9.501, source: 'Kartverket',
    feature: { type: 'Feature', geometry: { type: 'Point', coordinates: [9.501, 60.401] } } }];
  const [property] = normalizePublicProperties(rows, addresses);
  assert.deepEqual({ hNumber: property.hNumber, cadastralNumber: property.cadastralNumber, address: property.address,
    latitude: property.latitude, longitude: property.longitude }, {
    hNumber: 'H242', cadastralNumber: '10/524', address: 'Øvre Sprenåsen 37', latitude: 60.401, longitude: 9.501,
  });
  assert.deepEqual(Object.keys(property).sort(), ['address', 'cadastralNumber', 'geometry', 'hNumber', 'id', 'latitude', 'locationSource', 'longitude', 'source'].sort());
  assert.doesNotMatch(JSON.stringify(property), /private@example|Skal ikke ut|"91"/);
});

test('public property projection prefers a certain cadastral boundary over the address point', async () => {
  const { normalizePublicProperties, propertyBoundaryGeometry } = await publicService();
  const member = { h_number: 'H242', cadastral_number: '10/524', street_address: 'Øvre Sprenåsen 37' };
  const geometry = { type: 'Polygon', coordinates: [[[9.5, 60.4], [9.501, 60.4], [9.501, 60.401], [9.5, 60.4]]] };
  const boundaries = [{ references: [{ gnr: 10, bnr: 524, fnr: null, snr: null }], feature: { geometry } },
    { references: [{ gnr: 10, bnr: 524, fnr: 1, snr: null }], feature: { geometry: { type: 'Polygon', coordinates: [] } } }];
  assert.deepEqual(plain(propertyBoundaryGeometry(member, boundaries)), geometry);
  const [property] = normalizePublicProperties([member], [{ address: 'Øvre Sprenåsen 37', latitude: 60.4, longitude: 9.5 }], boundaries);
  assert.deepEqual(plain(property.geometry), geometry);
  assert.equal(property.locationSource, 'Kartverket / Geonorge');
});

test('public property projection never guesses between ambiguous address coordinates', async () => {
  const { normalizePublicProperties } = await publicService();
  const [property] = normalizePublicProperties(
    [{ h_number: 'H1', cadastral_number: null, street_address: 'Testvegen 1' }],
    [{ id: 'one', address: 'Testvegen 1', municipalityNumber: '3320', gnr: 10, bnr: 1, fnr: null, snr: null,
      latitude: 60.1, longitude: 9.1, feature: { type: 'Feature', geometry: { type: 'Point', coordinates: [9.1, 60.1] } } },
    { id: 'two', address: 'Testvegen 1', municipalityNumber: '3320', gnr: 10, bnr: 2, fnr: null, snr: null,
      latitude: 60.2, longitude: 9.2, feature: { type: 'Feature', geometry: { type: 'Point', coordinates: [9.2, 60.2] } } }],
  );
  assert.equal(property.latitude, null);
  assert.equal(property.longitude, null);
  assert.equal(property.geometry, null);
});

test('public hamlet lookup uses the stored member relationship as its source of truth', async () => {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({ text: strings.join('?'), values });
    return [{ id: '12', h_number: 'H12', cadastral_number: '10/12', street_address: 'Testvegen 12' }];
  };
  sql.query = async () => [{ id: '7', name: 'Testgrend', polygon: { type: 'Polygon', coordinates: [[[9, 60], [9.01, 60], [9.01, 60.01], [9, 60.01], [9, 60]]] }, polygon_reviewed: true, polygon_version: 1 }];
  const service = await loadModule('lib/map/public-map-service.js', {
    '../db.js': { getSql: () => sql }, '../mock-store.js': { isMockMode: () => false },
    './cache.js': { createMapCache: () => async (_key, loader) => loader() },
    './geo.js': { MapError }, './hamlets.js': { hamletRecord: (row) => ({ ...row, polygon: { type: 'Feature', properties: {}, geometry: row.polygon } }) },
    './kartverket-address-service.js': { findAddressesInPolygon: async () => ({ addresses: [], fetchedAt: '2026-09-16' }) },
    './kartverket-boundary-service.js': { findPropertiesInPolygon: async () => ({ boundaries: [], complete: true }) },
    './normalization.js': { normalizeAddress, normalizeCadastral, propertyLabel },
  }, { Intl });
  const result = await service.getPublicHamletProperties('7');
  assert.equal(result.properties.length, 1);
  assert.match(calls[0].text, /hamlet_id\s*=\s*\?/);
  assert.deepEqual(calls[0].values, ['7']);
});

test('public hamlet property route rate-limits, caches publicly and hides internal failures', async () => {
  let limited = false;
  let failure = null;
  const route = await loadModule('app/api/map/hamlets/[id]/properties/route.js', {
    '@/lib/map/public-map-service': { getPublicHamletProperties: async (id, options) => {
      assert.equal(id, '7'); assert.ok(options.signal);
      if (failure) throw failure;
      return { hamlet: { id: '7', name: 'Testgrend' }, properties: [] };
    } },
    '@/lib/map/geo': { MapError }, '@/lib/rate-limit': { isPublicMapRateLimited: () => limited },
  });
  const response = await route.GET(request('/api/map/hamlets/7/properties'), routeContext({ id: '7' }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /s-maxage=300/);
  limited = true;
  const throttled = await route.GET(request('/api/map/hamlets/7/properties'), routeContext({ id: '7' }));
  assert.equal(throttled.status, 429); assert.equal(throttled.headers.get('Retry-After'), '60');
  limited = false; failure = new Error('DATABASE_URL private@example.test');
  const failed = await route.GET(request('/api/map/hamlets/7/properties'), routeContext({ id: '7' }));
  assert.equal(failed.status, 500);
  assert.doesNotMatch(await failed.text(), /DATABASE_URL|private@example/);
});
