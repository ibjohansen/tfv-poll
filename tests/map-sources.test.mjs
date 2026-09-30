import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKGROUND_MAP, BUILDING_MAP, SATELLITE_MAP } from '../lib/map/sources.js';

test('map image sources use verified production services', () => {
  assert.equal(new URL(BACKGROUND_MAP.url.replace('{z}', '14').replace('{y}', '9000').replace('{x}', '9000')).protocol, 'https:');
  assert.equal(new URL(BUILDING_MAP.url).hostname, 'wms.geonorge.no');
  assert.equal(BUILDING_MAP.layers, 'bygning');
  assert.equal(BUILDING_MAP.version, '1.1.1');
  assert.equal(BUILDING_MAP.format, 'image/png');
  assert.ok(BUILDING_MAP.minZoom >= 16);
  assert.match(BUILDING_MAP.attribution, /Kartverket/);
  assert.equal(new URL(SATELLITE_MAP.url.replace('{z}', '16').replace('{y}', '18858').replace('{x}', '34496')).hostname, 'services.arcgisonline.com');
  assert.match(SATELLITE_MAP.attribution, /Esri/);
});
