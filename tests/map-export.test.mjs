import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'csv-parse/sync';
import { addressesCsv, comparisonCsv, toCsv, mapGeoJson, uniqueRoadNames } from '../lib/map/export.js';
import { normalizeKartverketAddress } from '../lib/map/kartverket-address-service.js';
import { validatePolygon } from '../lib/map/geo.js';
import { compareRegisterWithMapData } from '../lib/map/comparison.js';
import { rawAddress, square, official, register } from './fixtures/map.mjs';

test('address CSV has required columns, UTF-8 BOM, null blanks and Norwegian characters', () => {
  const csv = addressesCsv([normalizeKartverketAddress(rawAddress)]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  const [row] = parse(csv, { bom: true, columns: true });
  assert.equal(row.Adresse, 'Øvre Sprenåsen 37'); assert.equal(row.Gnr, '10'); assert.equal(row.Snr, '');
  assert.equal(Object.keys(row).length, 14); assert.equal(row.Latitude, '60.465');
});

test('CSV safely escapes quotes, commas, newlines and spreadsheet formulas', () => {
  const inputs = ['a,"b"\nc', '=HYPERLINK("bad")', ' +123', '\t@SUM(1)', '-1+2', 'vanlig tekst'];
  const rows = parse(toCsv(['value'], inputs.map((s) => [s])), { bom: true, columns: true });
  assert.equal(rows[0].value, inputs[0]);
  for (const row of rows.slice(1, 5)) assert.ok(row.value.startsWith("'"));
  assert.equal(rows[5].value, 'vanlig tekst');
});

test('comparison CSV preserves conflicting source values and internal contact attribution', () => {
  const report = compareRegisterWithMapData([{ ...register, bnr: 525, owners: ['Testperson'], emails: ['test@example.invalid'], phones: [] }], [official]);
  const [row] = parse(comparisonCsv(report), { bom: true, columns: true });
  assert.equal(row.Registerstatus, 'CONFLICT'); assert.equal(row['Gnr/Bnr Kartverket'], '10/524');
  assert.equal(row['Gnr/Bnr register'], '10/525'); assert.equal(row['E-post'], 'test@example.invalid'); assert.equal(row.Telefon, '');
  assert.match(row.Kilder, /Turufjell vel/);
});

test('GeoJSON contains sourced official features and polygon, not comparison contacts', () => {
  const address = normalizeKartverketAddress(rawAddress);
  const result = mapGeoJson(validatePolygon(square).polygon, [address]);
  assert.equal(result.features.length, 2);
  assert.ok(result.features.every((f) => f.properties.source));
  assert.equal(result.features[1].geometry.type, 'Point');
  assert.doesNotMatch(JSON.stringify(result), /emails|owners|phones/);
});

test('copied road names are unique and alphabetically sorted', () => {
  assert.deepEqual(uniqueRoadNames([{ addressName: 'Øvre Sprenåsen' }, { addressName: 'Istjernvegen' }], [{ name: 'Istjernvegen' }, { name: null }]), ['Istjernvegen', 'Øvre Sprenåsen']);
});
