import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '../helpers/postgres.mjs';
import { loadModule } from '../helpers/load-module.mjs';
import { parseCadastralNumber } from '../../lib/member-self-service-utils.js';

const db = createTestDatabase();
before(async () => { await db.migrate(); });
after(async () => { await db.close(); });

async function fixture({ attempts = null, stale = false, lookup } = {}) {
  const runId = randomUUID().replaceAll('-', '');
  const [member] = await db.sql`INSERT INTO members (h_number, street_address, cadastral_number, title_holder)
    VALUES (${`test-${randomUUID()}`}, 'Testvegen 7', '10/20', 'Syntetisk tidligere eier') RETURNING id`;
  await db.sql`INSERT INTO matrikkel_sync_runs (id, requested_by, total_count, status, worker_token, worker_lease_expires_at)
    VALUES (${runId}, 'admin@example.test', 1, ${stale ? 'running' : 'pending'}, ${stale ? 'expired-worker' : null},
      ${stale ? new Date(Date.now() - 60_000) : null})`;
  await db.sql`INSERT INTO matrikkel_sync_backups (run_id, member_id, cadastral_number, title_holder)
    SELECT ${runId}, id, cadastral_number, title_holder FROM members WHERE id = ${member.id}`;
  if (attempts !== null) await db.sql`INSERT INTO matrikkel_sync_items (run_id, member_id, status, worker_token, attempt_count, previous_values)
    VALUES (${runId}, ${member.id}, 'processing', 'expired-worker', ${attempts}, '{"title_holder":"Syntetisk tidligere eier"}')`;
  let lookups = 0;
  const api = await loadModule('lib/matrikkel-sync.js', {
    'node:crypto': { randomUUID }, './db.js': { getSql: () => db.sql },
    './admin-access.js': { requireMatrikkelSync: async () => ({ email: 'Editor@Example.test' }) },
    './mock-store.js': { isMockMode: () => false }, './member-self-service-utils.js': { parseCadastralNumber },
    './matrikkel-client.js': {
      MatrikkelClient: class {
        async verifyAccess() {}
        async lookupProperty() { lookups++; await lookup?.(); return { matrikkelId: 'synthetic-id', owners: [{ name: 'Syntetisk ny eier', dateFrom: '2026-01-01' }] }; }
      },
      loadA5Entries: async () => [], findA5Entry: () => null,
      lookupAddress: async () => ({ candidate: {}, matchType: 'EXACT' }),
      officialAddress: () => 'Testvegen 7', addressProperty: () => ({ gnr: '10', bnr: '20' }),
    },
  }, { setTimeout: (callback) => { callback(); return 0; }, process: { env: { API_MATRIKKEL_BASE_URL: 'https://example.invalid', API_MATRIKKEL_USR: 'synthetic', API_MATRIKKEL_PWD: 'synthetic' } } });
  return { api, runId, memberId: String(member.id), get lookups() { return lookups; } };
}

test('concurrent starts create one run and one snapshot, with a fresh snapshot after the advisory lock', async () => {
  const f = await fixture();
  const [member] = await db.sql`SELECT h_number FROM members WHERE id = ${f.memberId}`;
  // This dedicated loopback DB contains earlier synthetic fixtures. Temporarily
  // hide their active runs, then restore exactly those IDs in finally.
  const existing = await db.sql`UPDATE matrikkel_sync_runs SET deleted_at = NOW()
    WHERE status IN ('pending', 'running') AND deleted_at IS NULL RETURNING id`;
  let created;
  try {
    const results = await Promise.allSettled([f.api.createMatrikkelRun({ hNumber: member.h_number }), f.api.createMatrikkelRun({ hNumber: member.h_number })]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.find((r) => r.status === 'rejected').reason.message, 'Sync already running');
    created = results.find((r) => r.status === 'fulfilled').value;
    assert.equal(created.backup_count, 1); assert.equal(created.total_count, 1);
  } finally {
    if (created) await db.sql`UPDATE matrikkel_sync_runs SET status = 'cancelled' WHERE id = ${created.id}`;
    await db.sql`UPDATE matrikkel_sync_runs SET deleted_at = NULL WHERE id = ANY(${existing.map((r) => r.id)}::text[])`;
    await db.sql`UPDATE matrikkel_sync_runs SET status = 'cancelled' WHERE id = ${f.runId}`;
  }
});

test('expired processing work resumes once; completed work is never applied twice', async () => {
  const f = await fixture({ stale: true, attempts: 1 });
  assert.equal((await f.api.processMatrikkelRun(f.runId)).status, 'completed');
  assert.equal((await f.api.processMatrikkelRun(f.runId)).status, 'completed');
  assert.equal(f.lookups, 1);
  const [item] = await db.sql`SELECT * FROM matrikkel_sync_items WHERE run_id = ${f.runId}`;
  assert.equal(item.attempt_count, 2);
  assert.equal(item.previous_values.title_holder, 'Syntetisk tidligere eier');
  const audit = await db.sql`SELECT * FROM audit_log WHERE table_name = 'members' AND row_id = ${f.memberId} AND operation = 'UPDATE'`;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].changed_by, 'admin@example.test');
});

test('a live lease excludes a duplicate invocation', async () => {
  let started;
  const entered = new Promise((resolve) => { started = resolve; });
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const f = await fixture({ lookup: async () => { started(); await blocked; } });
  const first = f.api.processMatrikkelRun(f.runId);
  await entered;
  try {
    assert.equal((await f.api.processMatrikkelRun(f.runId)).workerBusy, true);
    assert.equal(f.lookups, 1);
  } finally { release(); await first; }
});

test('manual cancellation wins while a worker is waiting on an external service', async () => {
  let started;
  const entered = new Promise((resolve) => { started = resolve; });
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const f = await fixture({ lookup: async () => { started(); await blocked; } });
  const processing = f.api.processMatrikkelRun(f.runId);
  await entered;
  try { assert.equal((await f.api.cancelMatrikkelRun(f.runId)).status, 'cancelled'); }
  finally { release(); await processing; }
  const [member] = await db.sql`SELECT title_holder FROM members WHERE id = ${f.memberId}`;
  assert.equal(member.title_holder, 'Syntetisk tidligere eier');
  const [run] = await db.sql`SELECT status FROM matrikkel_sync_runs WHERE id = ${f.runId}`;
  assert.equal(run.status, 'cancelled');
  await f.api.deleteMatrikkelRunLog(f.runId);
  const actions = await db.sql`SELECT changed_by, after_value->>'action' AS action FROM audit_log
    WHERE table_name = 'admin_actions' AND row_id = ${f.runId} ORDER BY id`;
  assert.deepEqual(actions.map((row) => row.action), ['matrikkel_cancel', 'matrikkel_hide']);
  assert.ok(actions.every((row) => row.changed_by === 'editor@example.test'));
  await assert.rejects(f.api.deleteMatrikkelRunLog(f.runId), /Run not found/);
});

test('three interrupted attempts terminate visibly instead of retrying forever', async () => {
  const f = await fixture({ stale: true, attempts: 3 });
  const run = await f.api.processMatrikkelRun(f.runId);
  assert.equal(run.status, 'completed');
  assert.equal(run.error_count, 1);
  assert.equal(f.lookups, 0);
});

test('an old worker cannot write after its lease expires and another worker takes over', async () => {
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const f = await fixture({ lookup: async () => { if (++calls === 1) { entered(); await blocked; } } });
  const old = f.api.processMatrikkelRun(f.runId);
  await started;
  try {
    await db.sql`UPDATE matrikkel_sync_runs SET worker_lease_expires_at = NOW() - INTERVAL '1 second' WHERE id = ${f.runId}`;
    assert.equal((await f.api.processMatrikkelRun(f.runId)).status, 'completed');
  } finally { release(); await old; }
  const changes = await db.sql`SELECT id FROM audit_log WHERE table_name = 'members' AND row_id = ${f.memberId} AND operation = 'UPDATE'`;
  assert.equal(changes.length, 1);
});

test('two concurrent manual approvals perform only one update and one action', async () => {
  const f = await fixture({ attempts: 1 });
  await db.sql`UPDATE matrikkel_sync_items SET status = 'review', proposed_values = '{"cadastral_number":"10/21","title_holder":"Syntetisk godkjent eier"}' WHERE run_id = ${f.runId}`;
  const results = await Promise.allSettled([f.api.approveMatrikkelItem(f.runId, f.memberId), f.api.approveMatrikkelItem(f.runId, f.memberId)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const actions = await db.sql`SELECT id FROM audit_log WHERE table_name = 'admin_actions' AND row_id = ${f.runId}`;
  assert.equal(actions.length, 1);
});
