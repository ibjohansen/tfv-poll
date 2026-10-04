import 'server-only';
import { requirePermission } from './admin-access.js';
import { getSql } from './db.js';
import { isMockMode } from './mock-store.js';
import { revalidatePublicActivityMap } from './public-content-cache.js';
import { applyActivityImportCore, createActivityImportPreviewCore,
  rejectActivityImportItemsCore } from './activity-map-import/core.js';
import { MapError } from './map/errors.js';

const RUN_ID_PATTERN = /^[a-f0-9]{32}$/;

function activityImportRunRecord(run, candidates = []) {
  return {
    id: run.id, status: run.status, runType: run.run_type || 'manual', scheduledMonth: run.scheduled_month || null,
    sourceIds: run.source_ids, center: run.center, radiusKm: Number(run.radius_km), fetchedAt: run.fetched_at,
    rawSha256: run.raw_sha256, planSha256: run.plan_sha256, summary: run.summary,
    errorCode: run.error_code || null, createdAt: run.created_at, createdBy: run.created_by,
    appliedAt: run.applied_at || null, appliedBy: run.applied_by || null,
    followupCompletedAt: run.followup_completed_at || null, followupCompletedBy: run.followup_completed_by || null,
    candidates,
  };
}

function activityImportCandidateRecord(row) {
  return {
    id: row.id, sourceId: row.source_id, externalId: row.external_id, name: row.name,
    tooltipText: row.tooltip_text || null, operator: row.operator_name || null, websiteUrl: row.website_url || null,
    geometry: row.display_geometry || null, fingerprint: row.fingerprint, status: row.status,
    matchedFeatureId: row.matched_feature_id || null, matchedFeatureName: row.matched_feature_name || null,
    matchedItemId: row.matched_item_id || null, matchScore: row.match_score === null ? null : Number(row.match_score),
    matchReason: row.match_reason || null, decision: row.decision || null,
  };
}

export async function getActivityImportRuns(limit = 8) {
  await requirePermission('members');
  if (isMockMode()) return [];
  const safeLimit = Number.isInteger(limit) && limit > 0 && limit <= 20 ? limit : 8;
  return getSql().query(`SELECT id, status, run_type, scheduled_month, source_ids, center, radius_km, fetched_at,
      raw_sha256, plan_sha256, summary, error_code, created_at, created_by, applied_at, applied_by,
      followup_completed_at, followup_completed_by
    FROM activity_map_source_runs ORDER BY created_at DESC LIMIT $1`, [safeLimit]);
}

export async function getActivityImportRun(runId) {
  await requirePermission('members');
  if (isMockMode()) return null;
  if (!RUN_ID_PATTERN.test(runId || '')) throw new MapError('errors.activityImportSelection');
  const sql = getSql();
  const [run, candidates] = await Promise.all([
    sql.query(`SELECT id, status, run_type, scheduled_month, source_ids, center, radius_km, fetched_at,
        raw_sha256, plan_sha256, summary, error_code, created_at, created_by, applied_at, applied_by,
        followup_completed_at, followup_completed_by
      FROM activity_map_source_runs WHERE id = $1`, [runId]),
    sql.query(`SELECT i.id, i.source_id, i.external_id, i.name, i.tooltip_text, i.operator_name,
        i.website_url, i.display_geometry, i.fingerprint, i.status, i.matched_feature_id,
        f.name AS matched_feature_name, i.matched_item_id, i.match_score, i.match_reason, i.decision
      FROM activity_map_source_items i
      LEFT JOIN activity_map_features f ON f.id = i.matched_feature_id
      WHERE i.run_id = $1 ORDER BY i.source_id, lower(i.name), i.id`, [runId]),
  ]);
  return run[0] ? activityImportRunRecord(run[0], candidates.map(activityImportCandidateRecord)) : null;
}

export async function createActivityImportPreview(input, options = {}) {
  const user = await requirePermission('members');
  if (isMockMode()) throw new MapError('errors.activityImportMock', 409);
  return createActivityImportPreviewCore(input, { sql: getSql(), actor: user.email.toLowerCase(), ...options });
}

export async function applyActivityImport(input) {
  const user = await requirePermission('members');
  if (isMockMode()) throw new MapError('errors.activityImportMock', 409);
  const result = await applyActivityImportCore(input, { sql: getSql(), actor: user.email.toLowerCase() });
  revalidatePublicActivityMap();
  return result;
}

export async function rejectActivityImportItems(input) {
  const user = await requirePermission('members');
  if (isMockMode()) throw new MapError('errors.activityImportMock', 409);
  return rejectActivityImportItemsCore(input, { sql: getSql(), actor: user.email.toLowerCase() });
}

export async function completeActivityImportFollowup(runId) {
  const user = await requirePermission('members');
  if (isMockMode()) throw new MapError('errors.activityImportMock', 409);
  if (!RUN_ID_PATTERN.test(runId || '')) throw new MapError('errors.activityImportSelection');
  const actor = user.email.toLowerCase();
  const [run] = await getSql().query(`WITH completed AS (
      UPDATE activity_map_source_runs SET followup_completed_at = NOW(), followup_completed_by = $2
      WHERE id = $1 AND run_type = 'monthly' AND status IN ('preview', 'applied', 'failed')
        AND followup_completed_at IS NULL
      RETURNING id, followup_completed_at, followup_completed_by
    ), activity AS (
      INSERT INTO audit_log (table_name, row_id, operation, changed_by, after_value)
      SELECT 'admin_actions', id, 'INSERT', $2,
        jsonb_build_object('action', 'activity_import_followup_complete', 'run_id', id)
      FROM completed RETURNING row_id
    ) SELECT completed.* FROM completed WHERE EXISTS (SELECT 1 FROM activity)`, [runId, actor]);
  if (run) return run;
  const [existing] = await getSql().query(`SELECT id, status, run_type, followup_completed_at, followup_completed_by
    FROM activity_map_source_runs WHERE id = $1`, [runId]);
  if (!existing) throw new MapError('errors.activityImportSelection', 404);
  if (existing.run_type !== 'monthly' || ['fetching', 'applying'].includes(existing.status)) {
    throw new MapError('errors.activityImportChanged', 409);
  }
  return existing;
}
