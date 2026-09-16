import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, plain } from './helpers/load-module.mjs';
import { containsPoint, validatePolygon } from '../lib/map/geo.js';
import { normalizeCadastral } from '../lib/map/normalization.js';
import { square } from './fixtures/map.mjs';

async function moduleWith(lookup) {
  return loadModule('lib/map/member-hamlet-assignment.js', {
    '../matrikkel-client.js': { lookupAddress: lookup },
    './geo.js': { containsPoint, validatePolygon }, './normalization.js': { normalizeCadastral },
  });
}

test('new member is assigned only for an exact address inside one reviewed hamlet', async () => {
  let expected;
  const api = await moduleWith(async (_address, property) => {
    expected = plain(property);
    return { matchType: 'EXACT_PROPERTY', candidate: { representasjonspunkt: { epsg: 'EPSG:4326', lon: 9.495, lat: 60.465 } } };
  });
  const sql = async () => [{ id: '3', name: 'Testgrend', polygon: square }];
  const result = await api.findHamletForNewMember({ street_address: 'Testvegen 1', cadastral_number: '10/524', section_number: '2' }, { sql });
  assert.equal(result.status, 'linked'); assert.equal(result.hamlet.id, '3');
  assert.deepEqual(expected, { gnr: 10, bnr: 524, fnr: null, snr: 2 });
});

test('uncertain, unavailable and overlapping address matches never guess a hamlet', async () => {
  const fuzzy = await moduleWith(async () => ({ matchType: 'FUZZY', candidate: { representasjonspunkt: { epsg: 'EPSG:4326', lon: 9.495, lat: 60.465 } } }));
  const rows = [{ id: '1', name: 'En', polygon: square }, { id: '2', name: 'To', polygon: square }];
  assert.equal((await fuzzy.findHamletForNewMember({ street_address: 'Testvegen 1' }, { sql: async () => rows })).status, 'address_uncertain');
  const exact = await moduleWith(async () => ({ matchType: 'EXACT', candidate: { representasjonspunkt: { epsg: 'EPSG:4258', lon: 9.495, lat: 60.465 } } }));
  assert.equal((await exact.findHamletForNewMember({ street_address: 'Testvegen 1' }, { sql: async () => rows })).status, 'outside_or_ambiguous');
  const failed = await moduleWith(async () => { throw new Error('upstream'); });
  assert.equal((await failed.findHamletForNewMember({ street_address: 'Testvegen 1' }, { sql: async () => rows })).status, 'lookup_failed');
});
