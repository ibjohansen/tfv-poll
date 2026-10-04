import 'server-only';
import { requirePermission } from './admin-access.js';
import { getSql } from './db.js';
import { isMockMode } from './mock-store.js';
import { revalidatePublicActivityMap } from './public-content-cache.js';
import { applyActivityImportCore, createActivityImportPreviewCore,
  rejectActivityImportItemsCore } from './activity-map-import/core.js';
import { MapError } from './map/errors.js';

export async function getActivityImportRuns(limit = 8) {
  await requirePermission('members');
  if (isMockMode()) return [];
  const safeLimit = Number.isInteger(limit) && limit > 0 && limit <= 20 ? limit : 8;
  return getSql().query(`SELECT id, status, source_ids, center, radius_km, fetched_at, raw_sha256, plan_sha256,
      summary, error_code, created_at, created_by, applied_at, applied_by
    FROM activity_map_source_runs ORDER BY created_at DESC LIMIT $1`, [safeLimit]);
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
