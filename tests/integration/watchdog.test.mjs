import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '../helpers/postgres.mjs';
import { loadModule } from '../helpers/load-module.mjs';

const db = createTestDatabase();
before(async () => { await db.migrate(); });
after(async () => { await db.close(); });

test('watchdog claims a stuck accepted job only once and caps automatic redispatch', async () => {
  const runId = randomUUID().replaceAll('-', '');
  await db.sql`INSERT INTO matrikkel_sync_runs (id, requested_by, created_at)
    VALUES (${runId}, 'admin@example.test', NOW() - INTERVAL '1 hour')`;
  let dispatches = 0;
  const api = await loadModule('lib/background-watchdog.js', {
    './db.js': { getSql: () => db.sql },
    './matrikkel-background.js': { dispatchMatrikkelRun: async (id) => { assert.equal(id, runId); dispatches++; } },
  });
  const results = await Promise.all([api.recoverStalledMatrikkelRuns('https://example.test'), api.recoverStalledMatrikkelRuns('https://example.test')]);
  assert.equal(results.filter((result) => result.result === 'accepted').length, 1);
  assert.equal(dispatches, 1);
  for (let count = 2; count <= 4; count++) {
    await db.sql`UPDATE matrikkel_sync_runs SET last_dispatch_at = NOW() - INTERVAL '6 minutes' WHERE id = ${runId}`;
    assert.equal((await api.recoverStalledMatrikkelRuns('https://example.test')).result, count === 4 ? 'exhausted' : 'accepted');
  }
  assert.equal(dispatches, 3);
  const [run] = await db.sql`SELECT status, error_message FROM matrikkel_sync_runs WHERE id = ${runId}`;
  assert.equal(run.status, 'failed');
  assert.match(run.error_message, /tre gjenopptakingsforsøk/);
});

test('watchdog does not steal live reservations or restart cancelled jobs', async () => {
  for (const status of ['running', 'cancelled']) {
    const runId = randomUUID().replaceAll('-', '');
    await db.sql`INSERT INTO matrikkel_sync_runs (id, requested_by, status, created_at, worker_lease_expires_at)
      VALUES (${runId}, 'admin@example.test', ${status}, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '10 minutes')`;
    const api = await loadModule('lib/background-watchdog.js', {
      './db.js': { getSql: () => db.sql }, './matrikkel-background.js': { dispatchMatrikkelRun: async () => assert.fail('Unexpected dispatch') },
    });
    assert.equal((await api.recoverStalledMatrikkelRuns('https://example.test')).result, 'idle');
    await db.sql`UPDATE matrikkel_sync_runs SET status = 'cancelled' WHERE id = ${runId}`;
  }
});
