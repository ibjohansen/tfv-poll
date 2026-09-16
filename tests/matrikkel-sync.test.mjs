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
    if (query.includes('pg_advisory_xact_lock')) return [];
    if (query.includes("AND status = 'pending' AND started_at IS NULL")) {
      if (!state.run || state.run.status !== 'pending' || state.run.started_at || state.run.deleted_at) return [];
      state.run.status = 'failed';
      state.run.error_message = 'Bakgrunnsjobben kunne ikke startes.';
      return [{ ...state.run }];
    }
    if (query.includes('SELECT id, status FROM matrikkel_sync_runs') && query.includes('deleted_at IS NULL')) {
      return state.run && !state.run.deleted_at ? [{ ...state.run }] : [];
    }
    if (query.includes('SELECT id::text AS id, h_number')) return state.members.map((item) => ({ id: item.member_id, h_number: item.h_number, street_address: item.street_address, cadastral_number: item.cadastral_number }));
    if (query.includes('AS member_count')) return [{ member_count: state.memberExists ? 1 : 0 }];
    if (query.includes('WITH created AS')) return state.createConflict ? [] : [{ ...state.run, backup_count: state.members.length }];
    if (query.includes('SELECT id, status, requested_by')) return state.run ? [{ ...state.run }] : [];
    if (query.includes("started_at = COALESCE")) {
      if (state.cancelBeforeStart) state.run.status = 'cancelled';
      if (query.includes("status IN ('pending', 'running')") && state.run.status === 'cancelled') return [];
      state.run.status = 'running'; return [{ ...state.run }];
    }
    if (query.includes('SELECT id, status FROM matrikkel_sync_runs')) return state.run ? [{ ...state.run }] : [];
    if (query.includes('WITH candidates AS')) {
      const candidates = state.members.filter(m => !state.items.has(m.member_id)).slice(0, values[2]);
      for (const m of candidates) state.items.set(m.member_id, { status: 'processing' });
      return candidates;
    }
    if (query.includes('SELECT status FROM matrikkel_sync_runs')) {
      if (state.cancelBeforeItem) state.run.status = 'cancelled';
      return [{ status: state.run.status }];
    }
    if (query.includes('member_update AS')) {
      if (state.deletedMember) return [];
      const m = state.members.find(m => m.member_id === values[7]);
      Object.assign(m, { cadastral_number: values[2], section_number: values[3], title_holder: values[4], registration_date: values[5] });
      state.items.set(m.member_id, { status: values[8], proposed: JSON.parse(values[11]), matchType: values[10] });
      return [{ member_id: m.member_id }];
    }
    if (query.includes("message = 'Medlemmet finnes ikke lenger.'")) {
      state.items.set(values[1], { status: 'error', message: 'Medlemmet finnes ikke lenger.' });
      return [];
    }
    if (query.includes('UPDATE matrikkel_sync_items SET status = ?')) {
      state.items.set(values[9], { status: values[2], proposed: values[5] && JSON.parse(values[5]), message: values[7] });
      return [];
    }
    if (query.includes('attempt_count = attempt_count + 1')) return [{ member_id: values[1] }];
    if (query.includes('worker_token = NULL')) return [];
    if (query.includes('attempt_count >= 3')) return [];
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
  sql.transaction = (queries) => Promise.all(queries);
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
  assert.equal((await api.createMatrikkelRun({ memberId: '7' })).backup_count, 1);
  assert.match(state.queries[0].query, /pg_advisory_xact_lock/);
  assert.ok(state.queries[1].values.includes('admin@example.test'));
  assert.ok(state.queries[1].values.includes('["7"]'));
  assert.match(state.queries[1].query, /jsonb_array_elements_text/);
  assert.match(state.queries[1].query, /INSERT INTO matrikkel_sync_backups/);
  const count = state.queries.length;
  await assert.rejects(api.createMatrikkelRun({ hNumber: "'; DROP TABLE members" }), /Invalid H-number/);
  await assert.rejects(api.createMatrikkelRun({ memberId: '0' }), /Invalid member selection/);
  await assert.rejects(api.createMatrikkelRun({ memberId: '7', hNumber: 'H-7' }), /Invalid member selection/);
  assert.equal(state.queries.length, count);
  state.createConflict = true;
  await assert.rejects(api.createMatrikkelRun(), /Sync already running/);
});

test('new run snapshots an explicit multi-member selection without a schema change', async () => {
  const second = { ...member, member_id: '8', h_number: 'H-8', street_address: 'Testvegen 8' };
  const { api, state } = await setup({ members: [{ ...member }, second], run: { id: runId, status: 'pending', requested_by: 'admin@example.test', total_count: 2 } });
  assert.equal((await api.createMatrikkelRun({ memberIds: ['7', '8', '7'] })).backup_count, 2);
  assert.ok(state.queries[1].values.includes('["7","8"]'));
  await assert.rejects(api.createMatrikkelRun({ memberIds: ['7', '0'] }), /Invalid member selection/);
  await assert.rejects(api.createMatrikkelRun({ memberIds: '7,8' }), /Invalid member selection/);
  await assert.rejects(api.createMatrikkelRun({ memberIds: [] }), /Invalid member selection/);
  await assert.rejects(api.createMatrikkelRun({ memberId: '7', memberIds: ['8'] }), /Invalid member selection/);
});

test('member choices expose only property identity needed by the sync picker', async () => {
  const { api } = await setup();
  assert.deepEqual(plain(await api.getMatrikkelMemberOptions()), [{ id: '7', h_number: 'H-7', street_address: 'Testvegen 7', cadastral_number: '10/20' }]);
});

test('a deleted or unknown selected member cannot create an empty run', async () => {
  const { api, state } = await setup({ createConflict: true, memberExists: false });
  await assert.rejects(api.createMatrikkelRun({ memberId: '999' }), /Member not found/);
  assert.match(state.queries.at(-1).query, /deleted_at IS NULL/);
});

test('permission and mock checks happen before database access', async () => {
  for (const options of [{ denied: true }, { mock: true }]) {
    const { api, state } = await setup(options);
    await assert.rejects(api.createMatrikkelRun());
    assert.equal(state.queries.length, 0);
  }
});

test('failed dispatch marks only an unstarted pending run failed and preserves members and backups', async () => {
  const { api, state } = await setup();
  assert.equal((await api.failPendingMatrikkelRun(runId)).status, 'failed');
  assert.deepEqual(state.members, [member]);
  assert.equal(state.items.size, 0);
  assert.equal(state.queries.length, 1);
  const query = state.queries[0];
  assert.match(query.query, /status = 'pending' AND started_at IS NULL AND deleted_at IS NULL/);
  assert.match(query.query, /completed_at = NOW\(\)/);
  assert.doesNotMatch(query.query, /UPDATE members|DELETE|UPDATE matrikkel_sync_items/);
  assert.deepEqual(query.values, [runId]);
  assert.equal((await api.processMatrikkelRun(runId)).status, 'failed', 'late worker must not process a failed start');
  assert.equal(state.lookups.length, 0);
});

test('dispatch failure preserves concurrent processing and terminal states', async () => {
  for (const status of ['running', 'completed', 'cancelled', 'failed']) {
    const { api, state } = await setup();
    state.run.status = status;
    assert.equal((await api.failPendingMatrikkelRun(runId)).status, status);
    assert.equal(state.queries.length, 2);
    assert.deepEqual(state.members, [member]);
  }
  const { api, state } = await setup();
  state.run.started_at = '2026-09-15T12:00:00Z';
  assert.equal((await api.failPendingMatrikkelRun(runId)).status, 'pending');
});

test('dispatch failure status helper requires permission and rejects invalid, missing or deleted runs', async () => {
  const denied = await setup({ denied: true });
  await assert.rejects(denied.api.failPendingMatrikkelRun(runId), /Unauthorized/);
  assert.equal(denied.state.queries.length, 0);
  const invalid = await setup();
  await assert.rejects(invalid.api.failPendingMatrikkelRun('../invalid'), /Invalid run ID/);
  assert.equal(invalid.state.queries.length, 0);
  for (const run of [null, { id: runId, status: 'pending', deleted_at: '2026-09-15T12:00:00Z' }]) {
    const { api } = await setup({ run });
    await assert.rejects(api.failPendingMatrikkelRun(runId), /Run not found/);
  }
});

test('exact match updates property, collapses duplicate owners and records requester', async () => {
  const { api, state } = await setup({ owners: [{ name: ' Ny eier ', dateFrom: '2026-01-01' }, { name: 'Ny eier', dateFrom: '2026-01-01' }] });
  assert.equal((await api.processMatrikkelRun(runId)).status, 'completed');
  assert.equal(state.members[0].title_holder, 'Ny eier');
  assert.equal(state.members[0].registration_date, '2026-01-01');
  assert.equal(state.items.get('7').status, 'updated');
  assert.equal(state.queries.find(q => q.query.includes('member_update AS')).values[6], 'admin@example.test');
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
  assert.match(state.queries.find(q => q.query.includes('WITH candidates AS')).query, /ON CONFLICT \(run_id, member_id\) DO UPDATE/);
  assert.match(state.queries.find(q => q.query.includes('WITH candidates AS')).query, /matrikkel_sync_items.status = 'processing' AND matrikkel_sync_items.attempt_count < 3/);
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
  const { api, state } = await setup({ databaseFailure: query => query.includes('member_update AS') });
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
    assert.equal(state.queries.find(q => q.query.includes('WITH candidates AS')).values[2], expected);
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
