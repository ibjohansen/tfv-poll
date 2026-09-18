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
    'node:crypto': { randomUUID },
    './db.js': { getSql: () => db.sql },
    './matrikkel-background.js': { dispatchMatrikkelRun: async (id) => { assert.equal(id, runId); dispatches++; } },
    './survey-email-background.js': { dispatchSurveyEmailCampaign: async () => assert.fail('Unexpected survey dispatch') },
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
      'node:crypto': { randomUUID },
      './db.js': { getSql: () => db.sql }, './matrikkel-background.js': { dispatchMatrikkelRun: async () => assert.fail('Unexpected dispatch') },
      './survey-email-background.js': { dispatchSurveyEmailCampaign: async () => assert.fail('Unexpected survey dispatch') },
    });
    assert.equal((await api.recoverStalledMatrikkelRuns('https://example.test')).result, 'idle');
    await db.sql`UPDATE matrikkel_sync_runs SET status = 'cancelled' WHERE id = ${runId}`;
  }
});

test('watchdog dispatches one due MailerSend retry and defers a rejected dispatch', async () => {
  const surveyId = randomUUID().replaceAll('-', '');
  const campaignId = randomUUID().replaceAll('-', '');
  await db.sql`INSERT INTO surveys (id, title, ends_on) VALUES (${surveyId}, 'Retry test', '2099-12-31')`;
  await db.sql`INSERT INTO email_campaigns (id, survey_id, requested_by, retry_at, error_message)
    VALUES (${campaignId}, ${surveyId}, 'admin@example.test', NOW() - INTERVAL '1 minute', 'MAILERSEND_RATE_LIMIT')`;
  const [member] = await db.sql`INSERT INTO members (h_number, primary_contact_email)
    VALUES (${randomUUID()}, 'retry@example.test') RETURNING id`;
  await db.sql`INSERT INTO email_deliveries (id, campaign_id, member_id, survey_id, recipient_email, email_type, subject)
    VALUES (${randomUUID().replaceAll('-', '')}, ${campaignId}, ${member.id}, ${surveyId}, 'retry@example.test', 'survey_invitation', 'Retry')`;
  let dispatches = 0;
  const accepted = await loadModule('lib/background-watchdog.js', {
    'node:crypto': { randomUUID },
    './db.js': { getSql: () => db.sql },
    './matrikkel-background.js': { dispatchMatrikkelRun: async () => assert.fail('Unexpected matrikkel dispatch') },
    './survey-email-background.js': { dispatchSurveyEmailCampaign: async (id) => { assert.equal(id, campaignId); dispatches++; } },
  });
  const results = await Promise.all([
    accepted.recoverDueSurveyEmailCampaigns('https://example.test'),
    accepted.recoverDueSurveyEmailCampaigns('https://example.test'),
  ]);
  assert.equal(results.filter((result) => result.result === 'accepted').length, 1);
  assert.equal(dispatches, 1);

  await db.sql`UPDATE email_campaigns SET retry_at = NOW() - INTERVAL '1 minute' WHERE id = ${campaignId}`;
  const rejected = await loadModule('lib/background-watchdog.js', {
    'node:crypto': { randomUUID },
    './db.js': { getSql: () => db.sql },
    './matrikkel-background.js': { dispatchMatrikkelRun: async () => assert.fail('Unexpected matrikkel dispatch') },
    './survey-email-background.js': { dispatchSurveyEmailCampaign: async () => { throw new Error('unavailable'); } },
  });
  assert.equal((await rejected.recoverDueSurveyEmailCampaigns('https://example.test')).result, 'dispatch_failed');
  const [campaign] = await db.sql`SELECT retry_at FROM email_campaigns WHERE id = ${campaignId}`;
  assert.ok(new Date(campaign.retry_at).getTime() > Date.now());
});

test('monthly Matrikkel scheduler runs once on the first Oslo calendar day and snapshots all active members', async () => {
  const existing = await db.sql`UPDATE matrikkel_sync_runs SET deleted_at = NOW()
    WHERE status IN ('pending', 'running') AND deleted_at IS NULL RETURNING id`;
  let dispatches = 0;
  const api = await loadModule('lib/background-watchdog.js', {
    'node:crypto': { randomUUID },
    './db.js': { getSql: () => db.sql },
    './matrikkel-background.js': { dispatchMatrikkelRun: async () => { dispatches++; } },
    './survey-email-background.js': { dispatchSurveyEmailCampaign: async () => assert.fail('Unexpected survey dispatch') },
  });
  const options = {
    now: new Date('2026-10-01T04:00:00Z'),
    env: { API_MATRIKKEL_BASE_URL: 'https://example.test', API_MATRIKKEL_USR: 'synthetic', API_MATRIKKEL_PWD: 'synthetic' },
  };
  let run;
  try {
    const results = await Promise.all([
      api.startDueMonthlyMatrikkelRun('https://example.test', options),
      api.startDueMonthlyMatrikkelRun('https://example.test', options),
    ]);
    assert.equal(results.filter((result) => result.result === 'accepted').length, 1);
    assert.equal(dispatches, 1);
    [run] = await db.sql`SELECT id, run_type, scheduled_month, total_count FROM matrikkel_sync_runs
      WHERE run_type = 'monthly' AND scheduled_month = '2026-10-01'`;
    assert.equal(run.run_type, 'monthly');
    const [backup] = await db.sql`SELECT COUNT(*)::int AS count FROM matrikkel_sync_backups WHERE run_id = ${run.id}`;
    assert.equal(backup.count, run.total_count);
    const outsideSchedule = await api.startDueMonthlyMatrikkelRun('https://example.test', { ...options, now: new Date('2026-11-02T04:00:00Z') });
    assert.equal(outsideSchedule.result, 'idle');
  } finally {
    if (run) await db.sql`UPDATE matrikkel_sync_runs SET status = 'cancelled' WHERE id = ${run.id}`;
    await db.sql`UPDATE matrikkel_sync_runs SET deleted_at = NULL WHERE id = ANY(${existing.map((item) => item.id)}::text[])`;
  }
});
