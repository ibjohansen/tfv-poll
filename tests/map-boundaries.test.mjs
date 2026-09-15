import test from 'node:test';
import assert from 'node:assert/strict';
import { containsPoint } from '../lib/map/geo.js';
import { fromUtm32, toUtm32, boundaryBbox, findPropertiesInPolygon, parseBoundaryFeatures } from '../lib/map/kartverket-boundary-service.js';
import { square } from './fixtures/map.mjs';

// Synthetic GML matching the observed 20211101 schema; no person/member data.
const crs = 'urn:ogc:def:crs:EPSG::25832';
const ring = (points) => `<gml:LinearRing><gml:posList>${points.map(toUtm32).flat().join(' ')}</gml:posList></gml:LinearRing>`;
const rectangle = (x = 9.494, y = 60.464, size = .002) => [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]];
const polygon = (points = rectangle(), holes = []) => `<gml:Polygon srsName="${crs}"><gml:exterior>${ring(points)}</gml:exterior>${holes.map((hole) => `<gml:interior>${ring(hole)}</gml:interior>`).join('')}</gml:Polygon>`;
const reference = (bnr) => `<app:matrikkelenhet><app:Matrikkelenhet><app:kommunenummer>3320</app:kommunenummer><app:gardsnummer>10</app:gardsnummer><app:bruksnummer>${bnr}</app:bruksnummer></app:Matrikkelenhet></app:matrikkelenhet>`;
const feature = (id = 'teig.synthetic', geometry = polygon()) => `<wfs:member><app:Teig gml:id="${id}"><app:område>${geometry}</app:område><app:kommunenummer>3320</app:kommunenummer>${reference(524)}${reference(525)}<app:tvist>true</app:tvist><app:teigMedFlereMatrikkelenheter>true</app:teigMedFlereMatrikkelenheter><app:noyaktighetsklasseTeig>Gult</app:noyaktighetsklasseTeig><app:eier>Never retain</app:eier></app:Teig></wfs:member>`;
const collection = (members = '', count = 'unknown') => `<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:app="http://example.invalid/synthetic" numberMatched="${count}" numberReturned="0">${members}</wfs:FeatureCollection>`;
const mock = (results, before = 1, after = before) => {
  const calls = []; let hits = 0;
  return { calls, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return new Response(url.searchParams.get('resultType') === 'hits' ? collection('', hits++ ? after : before) : results);
  } };
};

test('UTM32 controls use easting/northing, round-trip Turufjell and conservatively bound geographic edges', () => {
  const origin = toUtm32([9, 0]); assert.ok(Math.abs(origin[0] - 500000) < .00001); assert.ok(Math.abs(origin[1]) < .00001);
  // 60N on UTM32 central meridian, GRS80 reference meridional arc.
  const north = toUtm32([9, 60]); assert.ok(Math.abs(north[1] - 6651411.190) < .01);
  const point = fromUtm32([527232.233, 6703323.679]);
  assert.ok(Math.abs(point[0] - 9.4952) < .0000001); assert.ok(Math.abs(point[1] - 60.4652) < .0000001);
  const bounds = boundaryBbox([9.49, 60.46, 9.50, 60.47]);
  for (const p of square.coordinates[0].map(toUtm32)) assert.ok(p[0] > bounds[0] && p[0] < bounds[2] && p[1] > bounds[1] && p[1] < bounds[3]);
});

test('GML preserves holes, all cadastral references, null unknowns and source but no unrelated fields', () => {
  const [value] = parseBoundaryFeatures(collection(feature('a', polygon(rectangle(), [rectangle(9.4945, 60.4645, .0005)]))));
  assert.equal(value.feature.geometry.coordinates.length, 2);
  assert.equal(containsPoint(value.feature, [9.4947, 60.4647]), false);
  assert.equal(containsPoint(value.feature, [9.4957, 60.4657]), true);
  assert.deepEqual(value.references.map((r) => r.bnr), [524, 525]);
  assert.equal(value.references[0].snr, null); assert.equal(value.references[0].fnr, null);
  assert.equal(value.accuracy, 'Gult'); assert.equal(value.disputed, true);
  assert.doesNotMatch(JSON.stringify(value), /Never retain|eier/); assert.equal(value.feature.properties.license, 'CC BY 4.0');
});

test('multi-surface and polygon patches preserve separate parcels; unsupported curves fail closed', () => {
  const multi = `<gml:MultiSurface srsName="${crs}"><gml:surfaceMember>${polygon()}</gml:surfaceMember><gml:surfaceMember>${polygon(rectangle(9.497, 60.464))}</gml:surfaceMember></gml:MultiSurface>`;
  const [value] = parseBoundaryFeatures(collection(feature('a', multi)));
  assert.equal(value.feature.geometry.type, 'MultiPolygon'); assert.equal(value.feature.geometry.coordinates.length, 2);
  const surface = `<gml:Surface srsName="${crs}"><gml:patches>${polygon().replaceAll('gml:Polygon', 'gml:PolygonPatch')}</gml:patches></gml:Surface>`;
  assert.equal(parseBoundaryFeatures(collection(feature('b', surface))).length, 1);
  assert.throws(() => parseBoundaryFeatures(collection(feature('a', '<gml:Curve/>'))));
});

test('GML rejects unexpected CRS, dimensions, external entities, links, duplicate IDs and malformed geometry', () => {
  const valid = collection(feature());
  for (const xml of [valid.replaceAll(crs, 'urn:ogc:def:crs:EPSG::25833'), valid.replace('<gml:posList>', '<gml:posList srsDimension="3">'),
    '<!DOCTYPE x [<!ENTITY ext SYSTEM "file:///etc/passwd">]>' + valid, valid.replace('<gml:Polygon ', '<gml:Polygon href="https://evil.test" '),
    collection(feature() + feature()), valid.replace('</gml:posList>', ' 0</gml:posList>'), '<broken>', collection('<wfs:member><app:Other/></wfs:member>')]) {
    assert.throws(() => parseBoundaryFeatures(xml));
  }
});

test('WFS checks hits before/after, ignores observed broken returned metadata and exact-filters a bbox result', async () => {
  const transport = mock(collection(feature('inside') + feature('outside', polygon(rectangle(9.51, 60.48)))) , 2);
  const result = await findPropertiesInPolygon(square, transport);
  assert.equal(result.complete, true); assert.equal(result.boundaries.length, 1); assert.equal(transport.calls.length, 3);
  const { url, options } = transport.calls[1];
  assert.equal(url.protocol, 'https:'); assert.equal(url.searchParams.get('typeNames'), 'app:Teig');
  assert.equal(url.searchParams.get('srsName'), crs); assert.match(url.searchParams.get('bbox'), /25832$/);
  assert.equal(options.headers.Authorization, undefined); assert.equal(options.redirect, 'error');
  assert.equal(url.searchParams.has('startIndex'), false);
});

test('WFS refuses unknown/oversized counts, truncation or changed counts and never reports partial success', async () => {
  for (const transport of [mock(collection(feature()), 'unknown'), mock(collection(feature()), 2001),
    mock(collection(feature()), 2), mock(collection(feature()), 1, 2)]) {
    await assert.rejects(findPropertiesInPolygon(square, transport), (e) => [409, 413].includes(e.status));
  }
  const empty = await findPropertiesInPolygon(square, mock(collection(), 0)); assert.equal(empty.boundaries.length, 0);
});

test('WFS retry, rate limit, cancellation and body budget do not expose raw errors', async () => {
  let calls = 0;
  const transport = mock(collection(feature()));
  const result = await findPropertiesInPolygon(square, { fetchImpl: (...args) => ++calls === 1 ? new Response('', { status: 503 }) : transport.fetchImpl(...args) });
  assert.equal(result.boundaries.length, 1); assert.equal(calls, 4);
  await assert.rejects(findPropertiesInPolygon(square, { fetchImpl: async () => new Response('secret', { status: 429 }) }), /opptatt/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(findPropertiesInPolygon(square, { signal: controller.signal, fetchImpl: async (_, { signal }) => { signal.throwIfAborted(); } }), (e) => e.status === 504);
  await assert.rejects(findPropertiesInPolygon(square, { fetchImpl: async () => new Response('x'.repeat(100001)) }), (e) => e.status === 413);
});
