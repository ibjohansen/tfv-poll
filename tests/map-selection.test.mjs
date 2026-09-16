import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonRowsForSelection, memberIdsForSelection } from '../lib/map/selection.js';

const address = { id: 'address:1', kind: 'address', gnr: 10, bnr: 524 };
const row = { id: 'register:7', register: { id: '7', hNumber: 'H7', gnr: 10, bnr: 524 }, officialAddresses: [address] };
const comparison = { rows: [row], unlocatedRows: [] };

test('map selections connect addresses, grouped properties and boundaries to a unique member', () => {
  assert.deepEqual(memberIdsForSelection(address, comparison), ['7']);
  assert.deepEqual(memberIdsForSelection({ kind: 'property', addresses: [address] }, comparison), ['7']);
  assert.deepEqual(memberIdsForSelection({ kind: 'boundary', references: [{ gnr: 10, bnr: 524 }] }, comparison), ['7']);
  assert.equal(comparisonRowsForSelection({ kind: 'boundary', references: [{ gnr: 10, bnr: 999 }] }, comparison).length, 0);
});

test('ambiguous map selections retain all candidates instead of choosing an owner', () => {
  const duplicate = { ...row, id: 'register:8', register: { ...row.register, id: '8' } };
  assert.deepEqual(memberIdsForSelection(address, { rows: [row, duplicate] }), ['7', '8']);
});
