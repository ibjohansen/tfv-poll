import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, request, routeContext } from './helpers/load-module.mjs';
import { MapError } from '../lib/map/geo.js';
import { normalizeAddress, normalizeCadastral, propertyLabel } from '../lib/map/normalization.js';

async function publicService() {
  return loadModule('lib/map/public-map-service.js', {
    '../db.js': { getSql: () => { throw new Error('Database must not be used by projection test'); } },
    '../mock-store.js': { isMockMode: () => false },
    './cache.js': { createMapCache: () => async (_key, loader) => loader() },
    './geo.js': { MapError }, './hamlets.js': { hamletRecord: (row) => row },
    './kartverket-address-service.js': { findAddressesInPolygon: async () => ({ addresses: [] }) },
    './normalization.js': { normalizeAddress, normalizeCadastral, propertyLabel },
  }, { Intl });
}

test('public property projection exposes only requested property fields and uses unambiguous official coordinates', async () => {
  const { normalizePublicProperties } = await publicService();
  const rows = [{ id: '91', h_number: 'H242', cadastral_number: '10/524', street_address: 'Øvre Sprenåsen 37',
    primary_contact_name: 'Skal ikke ut', primary_contact_email: 'private@example.test', title_holder: 'Skal ikke ut' }];
  const addresses = [{ id: 'official-1', address: 'øvre sprenåsen 37', gnr: 10, bnr: 524, fnr: null, snr: null,
    latitude: 60.401, longitude: 9.501, source: 'Kartverket' }];
  const [property] = normalizePublicProperties(rows, addresses);
  assert.deepEqual({ hNumber: property.hNumber, cadastralNumber: property.cadastralNumber, address: property.address,
    latitude: property.latitude, longitude: property.longitude }, {
    hNumber: 'H242', cadastralNumber: '10/524', address: 'Øvre Sprenåsen 37', latitude: 60.401, longitude: 9.501,
  });
  assert.deepEqual(Object.keys(property).sort(), ['address', 'cadastralNumber', 'hNumber', 'id', 'latitude', 'locationSource', 'longitude', 'source'].sort());
  assert.doesNotMatch(JSON.stringify(property), /private@example|Skal ikke ut|"91"/);
});

test('public property projection never guesses between ambiguous address coordinates', async () => {
  const { normalizePublicProperties } = await publicService();
  const [property] = normalizePublicProperties(
    [{ h_number: 'H1', cadastral_number: null, street_address: 'Testvegen 1' }],
    [{ address: 'Testvegen 1', gnr: 10, bnr: 1, latitude: 60.1, longitude: 9.1 },
      { address: 'Testvegen 1', gnr: 10, bnr: 2, latitude: 60.2, longitude: 9.2 }],
  );
  assert.equal(property.latitude, null);
  assert.equal(property.longitude, null);
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
