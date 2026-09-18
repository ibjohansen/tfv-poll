import { randomUUID } from 'node:crypto';
import { getSql } from './db.js';
import { dispatchMatrikkelRun } from './matrikkel-background.js';
import { dispatchSurveyEmailCampaign } from './survey-email-background.js';

export async function startDueMonthlyMatrikkelRun(origin, options = {}) {
  const env = options.env || process.env;
  if (!env.API_MATRIKKEL_BASE_URL || !env.API_MATRIKKEL_USR || !env.API_MATRIKKEL_PWD) {
    return { result: 'not_configured' };
  }
  const requestedAt = options.now === undefined ? null : new Date(options.now);
  if (requestedAt && !Number.isFinite(requestedAt.getTime())) throw new Error('Invalid scheduler time');
  const schedulerTime = requestedAt?.toISOString() || null;
  const runId = randomUUID().replaceAll('-', '');
  const sql = options.sql || getSql();
  const [, createdRows] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtextextended('tfv:matrikkel:monthly', 0))`,
    sql`
      WITH clock AS MATERIALIZED (
        SELECT timezone('Europe/Oslo', COALESCE(${schedulerTime}::timestamptz, NOW())) AS local_now
      ), selection AS MATERIALIZED (
        SELECT COUNT(*)::int AS total_count FROM members WHERE deleted_at IS NULL
      ), created AS (
        INSERT INTO matrikkel_sync_runs
          (id, requested_by, total_count, status, completed_at, run_type, scheduled_month)
        SELECT ${runId}, 'system:monthly-matrikkel', selection.total_count,
          CASE WHEN selection.total_count = 0 THEN 'completed' ELSE 'pending' END,
          CASE WHEN selection.total_count = 0 THEN NOW() ELSE NULL END,
          'monthly', date_trunc('month', clock.local_now)::date
        FROM clock CROSS JOIN selection
        WHERE EXTRACT(DAY FROM clock.local_now) = 1
          AND NOT EXISTS (SELECT 1 FROM matrikkel_sync_runs
            WHERE status IN ('pending', 'running') AND deleted_at IS NULL)
          AND NOT EXISTS (SELECT 1 FROM matrikkel_sync_runs
            WHERE run_type = 'monthly' AND scheduled_month = date_trunc('month', clock.local_now)::date)
        ON CONFLICT DO NOTHING
        RETURNING id, status, scheduled_month, total_count
      ), backup AS (
        INSERT INTO matrikkel_sync_backups
          (run_id, member_id, cadastral_number, section_number, title_holder, registration_date)
        SELECT created.id, m.id, m.cadastral_number, m.section_number, m.title_holder, m.registration_date
        FROM created CROSS JOIN members m WHERE m.deleted_at IS NULL
        RETURNING run_id
      )
      SELECT created.*, (SELECT COUNT(*)::int FROM backup) AS backup_count FROM created
    `,
  ]);
  const [run] = createdRows;
  if (!run) return { result: 'idle' };
  if (run.status === 'completed') return { result: 'completed', runId: run.id };
  try {
    await dispatchMatrikkelRun(run.id, origin);
    return { result: 'accepted', runId: run.id, scheduledMonth: run.scheduled_month };
  } catch {
    return { result: 'dispatch_failed', runId: run.id, scheduledMonth: run.scheduled_month };
  }
}

export async function recoverDueSurveyEmailCampaigns(origin) {
  const sql = getSql();
  const [campaign] = await sql`
    WITH due AS MATERIALIZED (
      SELECT id FROM email_campaigns
      WHERE status IN ('pending', 'running', 'failed') AND retry_at <= NOW()
        AND (worker_token IS NULL OR worker_lease_expires_at < NOW())
        AND EXISTS (SELECT 1 FROM email_deliveries
          WHERE campaign_id = email_campaigns.id AND status = 'pending')
      ORDER BY retry_at, created_at LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    UPDATE email_campaigns campaign SET retry_at = NULL
    FROM due WHERE campaign.id = due.id
    RETURNING campaign.id
  `;
  if (!campaign) return { result: 'idle' };
  try {
    await dispatchSurveyEmailCampaign(campaign.id, origin);
    return { result: 'accepted', campaignId: campaign.id };
  } catch {
    await sql`UPDATE email_campaigns SET retry_at = NOW() + INTERVAL '5 minutes'
      WHERE id = ${campaign.id} AND worker_token IS NULL`;
    return { result: 'dispatch_failed', campaignId: campaign.id };
  }
}

// Database claims serialize overlapping scheduler invocations. Only job IDs
// leave the database; member data, request payloads and secrets are not logged.
export async function recoverStalledMatrikkelRuns(origin) {
  const sql = getSql();
  const [run] = await sql`
    WITH due AS MATERIALIZED (
      SELECT id FROM matrikkel_sync_runs
      WHERE status IN ('pending', 'running') AND deleted_at IS NULL
        AND (worker_lease_expires_at IS NULL OR worker_lease_expires_at <= NOW())
        AND COALESCE(last_dispatch_at, started_at, created_at) < NOW() - INTERVAL '5 minutes'
      ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
    ), claimed AS (
      UPDATE matrikkel_sync_runs r SET last_dispatch_at = NOW(), dispatch_attempts = dispatch_attempts + 1,
        status = CASE WHEN dispatch_attempts >= 3 THEN 'failed' ELSE status END,
        completed_at = CASE WHEN dispatch_attempts >= 3 THEN NOW() ELSE completed_at END,
        worker_token = CASE WHEN dispatch_attempts >= 3 THEN NULL ELSE worker_token END,
        worker_lease_expires_at = CASE WHEN dispatch_attempts >= 3 THEN NULL ELSE worker_lease_expires_at END,
        processed_count = CASE WHEN dispatch_attempts >= 3 THEN
          (SELECT count(*)::int FROM matrikkel_sync_items WHERE run_id = r.id) ELSE processed_count END,
        error_count = CASE WHEN dispatch_attempts >= 3 THEN
          (SELECT count(*)::int FROM matrikkel_sync_items WHERE run_id = r.id AND status IN ('processing', 'error', 'skipped')) ELSE error_count END,
        error_message = CASE WHEN dispatch_attempts >= 3
          THEN 'Bakgrunnsjobben kom ikke videre etter tre gjenopptakingsforsøk. Kontroller funksjonsloggen før en ny kjøring.'
          ELSE error_message END
      FROM due WHERE r.id = due.id RETURNING r.id, r.status, r.dispatch_attempts
    ), abandoned AS (
      UPDATE matrikkel_sync_items SET status = 'error', completed_at = NOW(),
        message = 'Bakgrunnsjobben ble stoppet av overvåkingen.'
      WHERE run_id IN (SELECT id FROM claimed WHERE status = 'failed') AND status = 'processing'
      RETURNING member_id
    )
    SELECT claimed.*, (SELECT COUNT(*)::int FROM abandoned) AS abandoned_count FROM claimed
  `;
  if (!run) return { result: 'idle' };
  if (run.status === 'failed') return { result: 'exhausted', runId: run.id };
  try {
    await dispatchMatrikkelRun(run.id, origin);
    return { result: 'accepted', runId: run.id, attempt: run.dispatch_attempts };
  } catch {
    return { result: 'dispatch_failed', runId: run.id, attempt: run.dispatch_attempts };
  }
}
