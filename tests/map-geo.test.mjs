import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePolygon, containsPoint, clipRoad } from '../lib/map/geo.js';

import { square } from './fixtures/map.mjs';

test('polygon validation, bbox and area discard supplied metadata', () => {
  const result = validatePolygon({ type: 'Feature', bbox: [0, 0, 1, 1], properties: { email: 'private' }, geometry: square });
  assert.deepEqual(result.bbox, [9.49, 60.46, 9.5, 60.47]);
  assert.ok(result.areaM2 > 500_000 && result.areaM2 < 700_000);
  assert.equal(result.areaKm2, result.areaM2 / 1e6);
  assert.equal(result.polygon.properties.email, undefined);
});

test('reject malformed, open, degenerate, self-crossing, large and remote polygons', () => {
  for (const value of [null, [], { type: 'MultiPolygon' }, { ...square, coordinates: [...square.coordinates, square.coordinates[0]] },
    { ...square, coordinates: [square.coordinates[0].slice(0, -1)] },
    { ...square, coordinates: [[[9.49, 60.46], [9.5, 60.47], [9.49, 60.47], [9.5, 60.46], [9.49, 60.46]]] },
    { ...square, coordinates: [[[9.49, 60.46], [NaN, 60.46], [9.5, 60.47], [9.49, 60.46]]] },
    { ...square, coordinates: [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0]]] },
    { ...square, coordinates: [[[9, 60], [10, 60], [10, 61], [9, 60]]] },
    { ...square, coordinates: [[[9.49, 60.46], [9.5, 60.46], [9.51, 60.46], [9.49, 60.46]]] },
  ]) assert.throws(() => validatePolygon(value));
});

test('point-in-polygon includes boundary and excludes outside/missing coordinates', () => {
  const { polygon } = validatePolygon(square);
  assert.equal(containsPoint(polygon, [9.495, 60.465]), true);
  assert.equal(containsPoint(polygon, [9.49, 60.465]), true);
  assert.equal(containsPoint(polygon, [9.6, 60.465]), false);
  assert.equal(containsPoint(polygon, [null, null]), false);
});

test('roads are clipped, not merely selected; crossing roads and boundary segments work', () => {
  const { polygon } = validatePolygon(square);
  const road = clipRoad([[9.48, 60.465], [9.51, 60.465]], polygon);
  assert.ok(road.lengthMeters > 540 && road.lengthMeters < 560);
  assert.deepEqual(road.geometry.coordinates[0], [[9.49, 60.465], [9.5, 60.465]]);
  assert.equal(clipRoad([[9.48, 60.45], [9.51, 60.45]], polygon).geometry, null);
  assert.ok(clipRoad([[9.48, 60.46], [9.51, 60.46]], polygon).lengthMeters > 540);
});

test('concave polygon clips one road into disconnected inside pieces', () => {
  const { polygon } = validatePolygon({ type: 'Polygon', coordinates: [[[9.49, 60.46], [9.50, 60.46], [9.50, 60.47], [9.497, 60.47], [9.497, 60.463], [9.493, 60.463], [9.493, 60.47], [9.49, 60.47], [9.49, 60.46]]] });
  const result = clipRoad([[9.48, 60.465], [9.51, 60.465]], polygon);
  assert.equal(result.geometry.coordinates.length, 2);
  assert.ok(result.lengthMeters > 320 && result.lengthMeters < 340);
});

test('vertex limit, duplicate vertices, wrong axis values and narrow huge bbox are rejected', () => {
  const values = [
    { ...square, coordinates: [[...square.coordinates[0], ...square.coordinates[0]]] },
    { ...square, coordinates: [[...Array.from({ length: 201 }, (_, i) => [9.49 + i * 0.00001, 60.46]), [9.49, 60.46]]] },
    { ...square, coordinates: [[[200, 60], [201, 60], [201, 61], [200, 60]]] },
    { ...square, coordinates: [[[9.30, 60.46], [9.69, 60.46], [9.69, 60.4601], [9.30, 60.46]]] },
  ];
  for (const value of values) assert.throws(() => validatePolygon(value));
});
