import test from 'node:test';
import assert from 'node:assert/strict';
import { findAddressesInPolygon, normalizeKartverketAddress } from '../lib/map/kartverket-address-service.js';
import { findRoadsInPolygon } from '../lib/map/osm-road-service.js';
import { fetchMapJson, readLimitedJson } from '../lib/map/http.js';
import { createMapCache } from '../lib/map/cache.js';
import { square, rawAddress } from './fixtures/map.mjs';

const response = (adresser, total = adresser.length, side = 0) => Response.json({ metadata: { totaltAntallTreff: total, side }, adresser });

test('official adapter explicitly requests 4326, bounded circle and exact polygon filtering', async () => {
  const calls = [];
  const data = await findAddressesInPolygon(square, { fetchImpl: async (url, options) => {
    calls.push([new URL(url), options]);
    return response([rawAddress, { ...rawAddress, adressetekstutenadressetilleggsnavn: 'Utenfor 1', representasjonspunkt: { epsg: 'EPSG:4326', lon: 9.501, lat: 60.465 } }]);
  } });
  assert.equal(data.addresses.length, 1);
  assert.equal(data.complete, true);
  const [url, options] = calls[0];
  assert.equal(url.pathname, '/adresser/v1/punktsok');
  assert.equal(url.searchParams.get('koordsys'), '4326');
  assert.equal(url.searchParams.get('utkoordsys'), '4326');
  assert.ok(Number(url.searchParams.get('radius')) < 1000);
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers.Authorization, undefined);
});

test('normalization keeps null fields, preserves zero and strips unrelated personal data', () => {
  const value = normalizeKartverketAddress({ ...rawAddress, postnummer: null, eier: 'Never retain', seksjonsnummer: 7 });
  assert.equal(value.snr, null);
  assert.equal(value.fnr, 0);
  assert.equal(value.houseLetter, null);
  assert.equal(value.postalCode, null);
  assert.equal(value.eier, undefined);
  assert.equal(value.feature.properties.eier, undefined);
  assert.notEqual(value.id, normalizeKartverketAddress({ ...rawAddress, bruksnummer: 525 }).id);
});

test('pagination retrieves every page and retains multiple references at the same address', async () => {
  let calls = 0;
  const result = await findAddressesInPolygon(square, { fetchImpl: async (url) => {
    const page = Number(new URL(url).searchParams.get('side')); calls += 1;
    return page === 0 ? response(Array.from({ length: 1000 }, (_, i) => ({ ...rawAddress, bruksnummer: i + 1 })), 1001, page)
      : response([{ ...rawAddress, bruksnummer: 1001 }], 1001, page);
  } });
  assert.equal(calls, 2); assert.equal(result.addresses.length, 1001);
});

test('missing coordinates are explicit incomplete data, not a successful empty comparison', async () => {
  const result = await findAddressesInPolygon(square, { fetchImpl: async () => response([{ ...rawAddress, representasjonspunkt: null }]) });
  assert.equal(result.complete, false); assert.equal(result.unlocatedCount, 1);
});

test('bad CRS, missing metadata, incomplete pages and result caps fail closed', async () => {
  const factories = [
    () => response([{ ...rawAddress, representasjonspunkt: { epsg: 'EPSG:25833', lat: 6700000, lon: 200000 } }]),
    () => Response.json({ adresser: [] }), () => response([rawAddress], 1001), () => response([], 10001),
    () => response([], 1, 5),
  ];
  for (const factory of factories) await assert.rejects(findAddressesInPolygon(square, { fetchImpl: async () => factory() }));
});

test('Overpass query bounds requests, clips length and aggregates compatible named segments', async () => {
  const result = await findRoadsInPolygon(square, { fetchImpl: async (url, options) => {
    assert.equal(url, 'https://overpass-api.de/api/interpreter');
    assert.equal(options.method, 'POST');
    assert.match(new URLSearchParams(options.body).get('data'), /way\["highway"\]\(/);
    return Response.json({ elements: [1, 2].map((id) => ({ id, type: 'way', tags: { name: 'Testvegen', highway: 'residential' },
      geometry: [{ lon: 9.48, lat: 60.464 + id * 0.001 }, { lon: 9.51, lat: 60.464 + id * 0.001 }] })) });
  } });
  assert.equal(result.roads.length, 1); assert.equal(result.roads[0].osmIds.length, 2);
  assert.ok(result.roads[0].lengthMeters > 1080 && result.roads[0].lengthMeters < 1120);
  assert.equal(result.roads[0].access, null);
});

test('Overpass remarks and malformed geometry are treated as failures, not empty results', async () => {
  for (const data of [{ elements: [], remark: 'timeout' }, { elements: [{ id: 1, type: 'way', geometry: [{ lat: 1 }, { lat: 2 }] }] }, {}]) {
    await assert.rejects(findRoadsInPolygon(square, { fetchImpl: async () => Response.json(data) }));
  }
});

test('external failures are retried once, rate limits are not retried, and raw errors stay private', async () => {
  let attempts = 0;
  const result = await fetchMapJson('https://example.test', { source: 'Kartverket', fetchImpl: async () => {
    attempts += 1; return attempts === 1 ? new Response('bad', { status: 503 }) : Response.json({ ok: true });
  } });
  assert.equal(result.ok, true); assert.equal(attempts, 2);
  attempts = 0;
  await assert.rejects(fetchMapJson('https://example.test', { source: 'Kartverket', fetchImpl: async () => { attempts += 1; return new Response('private', { status: 429 }); } }), /opptatt/);
  assert.equal(attempts, 1);
  await assert.rejects(fetchMapJson('https://example.test', { source: 'Kartverket', fetchImpl: async () => { throw new Error('SECRET'); } }), (e) => !e.message.includes('SECRET'));
});

test('body size is limited while streaming, even without Content-Length', async () => {
  await assert.rejects(readLimitedJson(new Response('x'.repeat(100)), 50), (e) => e.status === 413);
});

test('cache expires, evicts, deduplicates in-flight requests, isolates callers and never caches failures', async () => {
  let time = 0; let loads = 0;
  const cached = createMapCache({ maxEntries: 1, ttlMs: 10, now: () => time });
  const loader = async () => { loads += 1; return { count: loads }; };
  const [a, b] = await Promise.all([cached('a', loader), cached('a', loader)]);
  a.count = 900; assert.equal(b.count, 1); assert.equal((await cached('a', loader)).count, 1);
  time = 11; await cached('a', loader); assert.equal(loads, 2);
  await cached('b', loader); await cached('a', loader); assert.equal(loads, 4);
  await assert.rejects(cached('failure', async () => { throw new Error('failure'); }));
  assert.deepEqual(await cached('failure', loader), { count: 5 });
});
