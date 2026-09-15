import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAddress, normalizeCadastral, propertyLabel, sortAddresses } from '../lib/map/normalization.js';
import { compareRegisterWithMapData } from '../lib/map/comparison.js';
import { propertiesFromAddresses } from '../lib/map/kartverket-property-service.js';
import { official, register, square } from './fixtures/map.mjs';

test('Norwegian address normalization handles case, whitespace, unicode and separated house letters', () => {
  assert.equal(normalizeAddress('Øvre Sprenåsen 37'), normalizeAddress('øvre sprenåsen 37 \u00a0'));
  assert.equal(normalizeAddress(' Øvre  Sprenåsen\t37 A'), normalizeAddress('Øvre Sprenåsen 37a'));
  assert.equal(normalizeAddress('Sprena\u030asen 37'), normalizeAddress('Sprenåsen 37'));
  assert.notEqual(normalizeAddress('Sprenåsen 37'), normalizeAddress('Øvre Sprenåsen 37'));
  assert.equal(normalizeAddress(null), '');
});

test('cadastral normalization preserves zero versus unknown and never guesses partial values', () => {
  assert.deepEqual(normalizeCadastral(' 010 / 00524 / 0 / 2 '), { gnr: 10, bnr: 524, fnr: 0, snr: 2 });
  assert.deepEqual(normalizeCadastral('10/524'), { gnr: 10, bnr: 524, fnr: null, snr: null });
  for (const value of ['10', '10/524/abc', '10/524/0/0/9', '-10/5']) assert.equal(normalizeCadastral(value).gnr, null);
  assert.equal(propertyLabel('10/524'), '10/524');
  assert.equal(propertyLabel({ gnr: 10, bnr: null }), '–');
});

test('address sorting is natural by street, house number and letter', () => {
  const result = sortAddresses([10, 2, 1].map((n) => ({ addressName: 'Vegen', houseNumber: n })));
  assert.deepEqual(result.map((a) => a.houseNumber), [1, 2, 10]);
});

test('same Norwegian address and cadastral reference is MATCH', () => {
  const report = compareRegisterWithMapData([register], [official]);
  assert.equal(report.rows[0].status, 'MATCH');
  assert.equal(report.counts.MATCH, 1);
  assert.equal(report.registerCount, 1);
});

test('same address but register 10/525 versus official 10/524 is CONFLICT', () => {
  const report = compareRegisterWithMapData([{ ...register, bnr: 525 }], [official]);
  assert.equal(report.rows[0].status, 'CONFLICT');
  assert.equal(report.rows[0].register.bnr, 525);
  assert.equal(report.rows[0].officialAddresses[0].bnr, 524);
  assert.equal(register.bnr, 524);
});

test('conflicting address is not hidden by a parcel match at another address', () => {
  const result = compareRegisterWithMapData([{ ...register, bnr: 525 }], [official, { ...official, id: 'b', address: 'Annen veg 2', bnr: 525 }]);
  assert.equal(result.rows[0].status, 'CONFLICT');
  assert.equal(result.rows[0].officialAddresses.length, 2);
});

test('missing cadastral references still match by exact address and produce quality notes', () => {
  const row = compareRegisterWithMapData([{ ...register, gnr: null, bnr: null }], [official]).rows[0];
  assert.equal(row.status, 'MATCH');
  assert.match(row.notes.join(' '), /Gnr\/bnr mangler/);
});

test('shared parcels retain all possible addresses; unique address disambiguates', () => {
  const addresses = [official, { ...official, id: 'b', address: 'Øvre Sprenåsen 39' }];
  const possible = compareRegisterWithMapData([{ ...register, address: null }], addresses).rows[0];
  assert.equal(possible.status, 'POSSIBLE_MATCH');
  assert.equal(possible.officialAddresses.length, 2);
  const report = compareRegisterWithMapData([register], addresses);
  assert.equal(report.rows[0].status, 'MATCH');
  assert.equal(report.counts.MISSING_IN_REGISTER, 1);
});

test('unknown sections are never confirmed; differing known sections or leaseholds conflict', () => {
  assert.equal(compareRegisterWithMapData([{ ...register, snr: 2 }], [official]).rows[0].status, 'POSSIBLE_MATCH');
  assert.equal(compareRegisterWithMapData([{ ...register, snr: 2 }], [{ ...official, snr: 3 }]).rows[0].status, 'CONFLICT');
  assert.equal(compareRegisterWithMapData([{ ...register, fnr: 2 }], [{ ...official, fnr: 0 }]).rows[0].status, 'CONFLICT');
});

test('duplicate register rows are flagged as possible rather than two certain matches', () => {
  const report = compareRegisterWithMapData([register, { ...register, id: '2' }], [official]);
  assert.equal(report.counts.MATCH, 0);
  assert.equal(report.counts.POSSIBLE_MATCH, 2);
});

test('never match owner names alone or same parcel numbers across known municipalities', () => {
  const report = compareRegisterWithMapData([{ id: '1', owners: ['Testnavn'] }, { ...register, id: '2', municipalityNumber: '0301' }], [{ ...official, owners: ['Testnavn'] }]);
  assert.equal(report.counts.MISSING_IN_MAP_DATA, 0);
  assert.equal(report.unlocatedRows.length, 2);
  assert.ok(report.unlocatedRows.every((row) => row.status === null));
  assert.equal(report.counts.MISSING_IN_REGISTER, 1);
  assert.match(report.unlocatedRows[0].notes.join(' '), /utenfor polygonet/);
});

test('unmatched plots are geographically scoped without guessing locations or omitting unknowns', () => {
  const plots = [{ ...register, id: 'inside', latitude: 60.465, longitude: 9.495 },
    { ...register, id: 'outside', latitude: 60.48, longitude: 9.495 }, { ...register, id: 'unknown', bnr: 999 },
    { ...register, id: 'parcel' }];
  const boundaries = [{ references: [{ gnr: 10, bnr: 524, municipalityNumber: '3320' }] }];
  const report = compareRegisterWithMapData(plots, [], { polygon: square, boundaries });
  assert.deepEqual(report.rows.map((r) => r.scope), ['point_in_polygon', 'parcel_intersects']);
  assert.equal(report.outsideCount, 1); assert.equal(report.unlocatedRows.length, 1);
  assert.equal(report.counts.MISSING_IN_MAP_DATA, 2);
  const foreign = compareRegisterWithMapData([{ ...register, municipalityNumber: '0301' }], [], { polygon: square, boundaries });
  assert.equal(foreign.unlocatedRows.length, 1);
});

test('property references retain all address locations and distinct leaseholds', () => {
  const features = [{ ...official, feature: { geometry: { coordinates: [9.495, 60.465] } } }, { ...official, id: 'b', fnr: 1 }];
  const result = propertiesFromAddresses(features);
  assert.equal(result.length, 2);
  assert.equal(result[0].boundaries, null);
  assert.equal(result[0].geometry.type, 'MultiPoint');
});
