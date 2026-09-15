import { getSql } from './db.js';
import { dispatchMatrikkelRun } from './matrikkel-background.js';

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
