import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadModule, plain } from './helpers/load-module.mjs';
import { parseCadastralNumber } from '../lib/member-self-service-utils.js';

const runId = 'a'.repeat(32);
const member = { member_id: '7', h_number: 'H-7', street_address: 'Testvegen 7', cadastral_number: '10/20', section_number: null, title_holder: 'Tidligere eier', registration_date: '2020-01-01' };

async function setup(options = {}) {
  const state = {
    run: { id: runId, status: 'pending', requested_by: 'admin@example.test', total_count: 1 },
    members: [{ ...member }], items: new Map(), queries: [], lookups: [], addresses: [],
    owners: [{ name: 'Ny eier', dateFrom: '2026-01-01' }], matchType: 'EXACT', ...options,
  };
  const sql = async (strings, ...values) => {
    const query = strings.join('?');
    state.queries.push({ query, values });
    if (state.databaseFailure?.(query)) throw new Error('Database unavailable');
    if (query.includes('WITH created AS')) return state.createConflict ? [] : [{ ...state.run, backup_count: state.members.length }];
    if (query.includes('SELECT id, status, requested_by')) return state.run ? [{ ...state.run }] : [];
    if (query.includes("started_at = COALESCE")) {
      if (state.cancelBeforeStart) state.run.status = 'cancelled';
      if (query.includes("status IN ('pending', 'running')") && state.run.status === 'cancelled') return [];
      state.run.status = 'running'; return [{ ...state.run }];
    }
    if (query.includes('SELECT id, status FROM matrikkel_sync_runs')) return state.run ? [{ ...state.run }] : [];
    if (query.includes('WITH candidates AS')) {
      const candidates = state.members.filter(m => !state.items.has(m.member_id)).slice(0, values[1]);
      for (const m of candidates) state.items.set(m.member_id, { status: 'processing' });
      return candidates;
    }
    if (query.includes('SELECT status FROM matrikkel_sync_runs')) {
      if (state.cancelBeforeItem) state.run.status = 'cancelled';
      return [{ status: state.run.status }];
    }
    if (query.includes('WITH member_update AS')) {
      if (state.deletedMember) return [];
      const m = state.members.find(m => m.member_id === values[5]);
      Object.assign(m, { cadastral_number: values[0], section_number: values[1], title_holder: values[2], registration_date: values[3] });
      state.items.set(m.member_id, { status: values[7], proposed: JSON.parse(values[10]), matchType: values[9] });
      return [{ member_id: m.member_id }];
    }
    if (query.includes("message = 'Medlemmet finnes ikke lenger.'")) {
      state.items.set(values[1], { status: 'error', message: 'Medlemmet finnes ikke lenger.' });
      return [];
    }
    if (query.includes('UPDATE matrikkel_sync_items SET status = ?')) {
      state.items.set(values[7], { status: values[0], proposed: values[3] && JSON.parse(values[3]), message: values[5] });
      return [];
    }
    if (query.includes("UPDATE matrikkel_sync_items SET status = 'error'")) {
      for (const item of state.items.values()) if (item.status === 'processing') Object.assign(item, { status: 'error', message: values[0] });
      return [];
    }
    if (query.includes("SET status = 'failed'")) {
      if (state.cancelBeforeFailure) state.run.status = 'cancelled';
      if (!query.includes("AND status IN ('pending', 'running')") || state.run.status !== 'cancelled') state.run.status = 'failed';
      return [];
    }
    if (query.includes('WITH counts AS')) {
      if (state.cancelBeforeCounts) state.run.status = 'cancelled';
      if (query.includes("r.status IN ('pending', 'running', 'completed')") && state.run.status === 'cancelled') return [];
      state.run.processed_count = [...state.items.values()].filter(i => i.status !== 'processing').length;
      state.run.status = state.run.processed_count >= state.run.total_count ? 'completed' : 'running';
      return [{ ...state.run }];
    }
    throw new Error(`Unexpected SQL: ${query}`);
  };
  const api = await loadModule('lib/matrikkel-sync.js', {
    'node:crypto': { randomUUID }, './db.js': { getSql: () => sql },
    './admin-access.js': { requireMatrikkelSync: async () => { if (state.denied) throw new Error('Unauthorized'); return { email: 'Admin@Example.test' }; } },
    './mock-store.js': { isMockMode: () => Boolean(state.mock) },
    './member-self-service-utils.js': { parseCadastralNumber },
    './matrikkel-client.js': {
      MatrikkelClient: class {
        async verifyAccess() { if (state.resourceError) throw state.resourceError; }
        async lookupProperty(property) {
          state.lookups.push(plain(property));
          if (state.lookupError) throw state.lookupError;
          return { matrikkelId: '99', owners: state.owners };
        }
      },
      loadA5Entries: async () => [], findA5Entry: () => state.a5 || null,
      lookupAddress: async (address, property) => {
        state.addresses.push({ address, property });
        if (state.addressError && address === 'Bad address') throw state.addressError;
        return { candidate: {}, matchType: state.matchType };
      },
      officialAddress: () => 'Testvegen 7, Flå',
      addressProperty: () => state.property || { gnr: '10', bnr: '20' },
    },
  }, {
    process: { env: { API_MATRIKKEL_BASE_URL: 'https://example.test', API_MATRIKKEL_USR: 'synthetic', API_MATRIKKEL_PWD: 'synthetic' } },
    setTimeout: (fn) => { fn(); return 0; },
  });
  return { api, state };
}

test('new run snapshots selection, records actor and rejects invalid or concurrent starts', async () => {
  const { api, state } = await setup();
  assert.equal((await api.createMatrikkelRun({ hNumber: ' H-7 ' })).backup_count, 1);
  assert.ok(state.queries[0].values.includes('admin@example.test'));
  assert.ok(state.queries[0].values.includes('H-7'));
  assert.match(state.queries[0].query, /INSERT INTO matrikkel_sync_backups/);
  const count = state.queries.length;
  await assert.rejects(api.createMatrikkelRun({ hNumber: "'; DROP TABLE members" }), /Invalid H-number/);
  assert.equal(state.queries.length, count);
  state.createConflict = true;
  await assert.rejects(api.createMatrikkelRun(), /Sync already running/);
});

test('permission and mock checks happen before database access', async () => {
  for (const options of [{ denied: true }, { mock: true }]) {
    const { api, state } = await setup(options);
    await assert.rejects(api.createMatrikkelRun());
    assert.equal(state.queries.length, 0);
  }
});

test('exact match updates property, collapses duplicate owners and records requester', async () => {
  const { api, state } = await setup({ owners: [{ name: ' Ny eier ', dateFrom: '2026-01-01' }, { name: 'Ny eier', dateFrom: '2026-01-01' }] });
  assert.equal((await api.processMatrikkelRun(runId)).status, 'completed');
  assert.equal(state.members[0].title_holder, 'Ny eier');
  assert.equal(state.members[0].registration_date, '2026-01-01');
  assert.equal(state.items.get('7').status, 'updated');
  assert.equal(state.queries.find(q => q.query.includes('WITH member_update AS')).values[4], 'admin@example.test');
});

test('unchanged values and repeated processing are idempotent', async () => {
  const { api, state } = await setup({ owners: [{ name: member.title_holder, dateFrom: member.registration_date }] });
  await api.processMatrikkelRun(runId);
  assert.equal(state.items.get('7').status, 'unchanged');
  const lookupCount = state.lookups.length;
  await api.processMatrikkelRun(runId);
  assert.equal(state.lookups.length, lookupCount);
  assert.equal(state.items.size, 1);
});

test('incomplete and approximate matches go to review without replacing member data', async () => {
  for (const options of [{ matchType: 'FUZZY' }, { owners: [] }]) {
    const { api, state } = await setup(options);
    await api.processMatrikkelRun(runId);
    assert.equal(state.items.get('7').status, 'review');
    assert.equal(state.members[0].title_holder, member.title_holder);
    assert.equal(state.queries.some(q => q.query.includes('UPDATE members SET')), false);
  }
});

test('missing address is skipped and missing property numbers become item errors', async () => {
  const missing = await setup({ members: [{ ...member, street_address: null }] });
  await missing.api.processMatrikkelRun(runId);
  assert.equal(missing.state.items.get('7').status, 'skipped');
  assert.equal(missing.state.lookups.length, 0);
  const invalid = await setup({ property: { gnr: '0', bnr: '20' } });
  await invalid.api.processMatrikkelRun(runId);
  assert.equal(invalid.state.items.get('7').status, 'error');
  assert.equal(invalid.state.lookups.length, 0);
});

test('A5 mapping uses underlying property and preserves section number', async () => {
  const { api, state } = await setup({ members: [{ ...member, section_number: '3' }], a5: { underlying: { gnr: '10', bnr: '30' } } });
  await api.processMatrikkelRun(runId);
  assert.deepEqual(state.lookups, [{ gnr: '10', bnr: '30', snr: '3' }]);
  assert.equal(state.items.get('7').matchType, 'EXACT_A5');
});

test('same property on multiple rows uses one lookup and processes each member once', async () => {
  const { api, state } = await setup({ members: [{ ...member }, { ...member, member_id: '8' }], run: { id: runId, status: 'pending', total_count: 2 } });
  await api.processMatrikkelRun(runId);
  assert.equal(state.lookups.length, 1);
  assert.equal(state.items.size, 2);
  assert.match(state.queries.find(q => q.query.includes('WITH candidates AS')).query, /ON CONFLICT \(run_id, member_id\) DO NOTHING/);
});

test('one failed address does not prevent other members from completing', async () => {
  const { api, state } = await setup({
    members: [{ ...member, street_address: 'Bad address' }, { ...member, member_id: '8' }],
    run: { id: runId, status: 'pending', total_count: 2 },
    addressError: new Error('Failed https://private.example.test/path?secret=hidden'),
  });
  assert.equal((await api.processMatrikkelRun(runId)).status, 'completed');
  assert.equal(state.items.get('7').status, 'error');
  assert.doesNotMatch(state.items.get('7').message, /private|secret|hidden/);
  assert.equal(state.items.get('8').status, 'updated');
});

test('property service failures are recorded without changing member fields', async () => {
  const { api, state } = await setup({ lookupError: new Error('Temporarily unavailable') });
  await api.processMatrikkelRun(runId);
  assert.equal(state.items.get('7').status, 'error');
  assert.equal(state.members[0].title_holder, member.title_holder);
});

test('resource initialization failure marks claimed items and run failed, then permits a fresh resource attempt', async () => {
  const { api, state } = await setup({ resourceError: new Error('Authentication failed') });
  await assert.rejects(api.processMatrikkelRun(runId), /Authentication failed/);
  assert.equal(state.run.status, 'failed');
  assert.equal(state.items.get('7').status, 'error');
  state.resourceError = null;
  state.run.status = 'pending';
  state.items.clear();
  assert.equal((await api.processMatrikkelRun(runId)).status, 'completed');
});

test('database write failure does not report an update as successful', async () => {
  const { api, state } = await setup({ databaseFailure: query => query.includes('WITH member_update AS') });
  await api.processMatrikkelRun(runId);
  assert.equal(state.items.get('7').status, 'error');
  assert.equal(state.members[0].title_holder, member.title_holder);
});

test('member deleted while work is in progress is recorded as unavailable', async () => {
  const { api, state } = await setup({ deletedMember: true });
  await api.processMatrikkelRun(runId);
  assert.equal(state.items.get('7').status, 'error');
});

test('cancellation before processing prevents property lookup and member mutation', async () => {
  const { api, state } = await setup({ cancelBeforeItem: true });
  assert.equal((await api.processMatrikkelRun(runId)).status, 'cancelled');
  assert.equal(state.lookups.length, 0);
  assert.equal(state.queries.some(q => q.query.includes('UPDATE members SET')), false);
});

test('partial batches continue without reclaiming processed rows', async () => {
  const { api, state } = await setup({ members: [{ ...member }, { ...member, member_id: '8' }], run: { id: runId, status: 'pending', total_count: 2 } });
  assert.equal((await api.processMatrikkelRun(runId, { batchSize: 1 })).status, 'running');
  assert.equal(state.items.size, 1);
  assert.equal((await api.processMatrikkelRun(runId, { batchSize: 1 })).status, 'completed');
  assert.equal(state.items.size, 2);
});

test('late start, completion and failure never overwrite a cancellation', async () => {
  for (const options of [{ cancelBeforeStart: true }, { cancelBeforeCounts: true }]) {
    const { api, state } = await setup(options);
    assert.equal((await api.processMatrikkelRun(runId)).status, 'cancelled');
    assert.equal(state.run.status, 'cancelled');
    if (options.cancelBeforeStart) assert.equal(state.items.size, 0);
  }
  const { api, state } = await setup({ cancelBeforeFailure: true, resourceError: new Error('Resource failed') });
  await assert.rejects(api.processMatrikkelRun(runId), /Resource failed/);
  assert.equal(state.run.status, 'cancelled');
});

test('batch limit is a bounded integer for fractional, zero and oversized inputs', async () => {
  for (const [batchSize, expected] of [[1.5, 1], [-2, 1], [0, 5], [100, 10]]) {
    const { api, state } = await setup();
    await api.processMatrikkelRun(runId, { batchSize });
    assert.equal(state.queries.find(q => q.query.includes('WITH candidates AS')).values[1], expected);
  }
});

test('invalid or missing run and terminal statuses do not contact external services', async () => {
  const { api, state } = await setup();
  await assert.rejects(api.processMatrikkelRun('invalid'), /Invalid run ID/);
  assert.equal(state.queries.length, 0);
  for (const status of ['completed', 'failed', 'cancelled']) {
    state.run.status = status;
    assert.equal((await api.processMatrikkelRun(runId)).status, status);
  }
  state.run = null;
  await assert.rejects(api.processMatrikkelRun(runId), /Run not found/);
  assert.equal(state.lookups.length, 0);
});
