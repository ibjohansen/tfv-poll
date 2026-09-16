import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, plain } from './helpers/load-module.mjs';
import * as normalization from '../lib/map/normalization.js';

const hamlets = [
  { id: '1', name: 'En', polygon: { marker: 'one' }, polygon_version: 4 },
  { id: '2', name: 'To', polygon: { marker: 'two' }, polygon_version: 7 },
];
const members = [
  { id: '1', h_number: '1', street_address: 'Ny 1', cadastral_number: '10/1', section_number: null, hamlet_id: null },
  { id: '2', h_number: '2', street_address: 'Flytt 2', cadastral_number: '10/2', section_number: null, hamlet_id: '1' },
  { id: '3', h_number: '3', street_address: 'Utenfor 3', cadastral_number: '10/3', section_number: null, hamlet_id: '1' },
  { id: '4', h_number: '4', street_address: 'Uavklart 4', cadastral_number: '10/4', section_number: null, hamlet_id: '1' },
  { id: '5', h_number: '5', street_address: 'Overlapp 5', cadastral_number: '10/5', section_number: null, hamlet_id: null },
  { id: '6', h_number: '6', street_address: 'Samme 6', cadastral_number: '10/6', section_number: null, hamlet_id: '1' },
];

async function setup({ polygonsUnchanged = true, complete = true } = {}) {
  const calls = [];
  const sql = { query: async (text, args = []) => {
    calls.push({ text, args });
    if (/SELECT id, name, polygon/.test(text)) return hamlets;
    if (/SELECT id, h_number/.test(text)) return members;
    const changes = JSON.parse(args[1]);
    return [{ polygons_unchanged: polygonsUnchanged, changed_count: changes.length }];
  } };
  const comparison = (_register, official) => ({
    officialCount: official.length,
    rows: (official[0]?.memberIds || []).map((id) => ({
      status: 'MATCH', scope: 'address_in_polygon', register: { id },
    })),
  });
  const api = await loadModule('lib/map/hamlet-member-sync.js', {
    '../db.js': { getSql: () => sql }, '../matrikkel-client.js': { lookupAddress: async () => { throw new Error('unused'); } },
    './comparison.js': { compareRegisterWithMapData: comparison },
    './kartverket-address-service.js': { findAddressesInPolygon: async () => ({ complete: true, addresses: [] }) },
    './hamlet-assignment-utils.js': {
      expectedHamletProperty: () => ({ gnr: 10, bnr: 1 }),
      addressPointCoordinates: (candidate) => candidate.coordinates,
      hamletsContainingPoint: (rows, coordinates) => coordinates[0] === 2 ? [rows[1]] : [],
    },
    './normalization.js': normalization,
  });
  const findAddresses = async (polygon) => ({ complete, addresses: [{ memberIds: polygon.marker === 'one' ? ['1', '5', '6'] : ['5'] }] });
  const lookup = async (address) => {
    if (address.startsWith('Uavklart')) throw new Error('upstream');
    return { matchType: 'EXACT_PROPERTY', candidate: { coordinates: [address.startsWith('Flytt') ? 2 : 0, 0] } };
  };
  return { api, sql, calls, findAddresses, lookup };
}

test('full rematch assigns, moves and safely unlinks only proven exact locations', async () => {
  const { api, sql, calls, findAddresses, lookup } = await setup();
  const result = await api.synchronizeMemberHamlets({
    sql, findAddresses, lookup, trigger: { hamletId: '1', polygonVersion: 4 }, signal: new AbortController().signal,
  });
  assert.deepEqual(plain(result), {
    hamletCount: 2, activeMemberCount: 6, changedCount: 3,
    assignedCount: 1, movedCount: 1, unassignedCount: 1, ambiguousCount: 1, unresolvedCount: 1,
    officialAddressCount: 2,
  });
  const apply = calls.at(-1);
  const changes = JSON.parse(apply.args[1]);
  assert.deepEqual(changes, [
    { member_id: '1', previous_hamlet_id: null, hamlet_id: '1' },
    { member_id: '2', previous_hamlet_id: '1', hamlet_id: '2' },
    { member_id: '3', previous_hamlet_id: '1', hamlet_id: null },
  ]);
  assert.match(apply.text, /polygon_version <> e\.version/);
  assert.match(apply.text, /m\.hamlet_id IS NOT DISTINCT FROM requested\.previous_hamlet_id/);
  const audit = JSON.parse(apply.args[3]);
  assert.equal(audit.action, 'hamlet_members_sync');
  assert.equal(audit.changed_count, 3);
  assert.equal(audit.trigger_hamlet_id, '1');
  assert.doesNotMatch(JSON.stringify(audit), /Ny 1|Flytt 2|Uavklart 4/);
});

test('rematch refuses incomplete address data and stale polygon snapshots', async () => {
  const incomplete = await setup({ complete: false });
  await assert.rejects(incomplete.api.synchronizeMemberHamlets({
    sql: incomplete.sql, findAddresses: incomplete.findAddresses, lookup: incomplete.lookup,
  }), /Incomplete address data/);
  assert.equal(incomplete.calls.length, 2);

  const stale = await setup({ polygonsUnchanged: false });
  await assert.rejects(stale.api.synchronizeMemberHamlets({
    sql: stale.sql, findAddresses: stale.findAddresses, lookup: stale.lookup,
  }), /polygon changed/);
});
