import 'server-only';
import { requirePermission } from './admin-access.js';
import { getSql } from './db.js';
import { isMockMode } from './mock-store.js';
import { randomId } from './member-self-service-utils.js';
import { revalidatePublicActivityMap } from './public-content-cache.js';
import { activityFeatureRecord, normalizeActivityFeatureInput, publicActivityFeatureRecord } from './activity-map.js';
import { MapError } from './map/geo.js';

const PUBLIC_FIELDS = 'id, name, category, activity_number, feature_type, alpine_color, geometry';
const FIELDS = `${PUBLIC_FIELDS}, is_draft, version`;

export async function getPublicActivityMapFeatures() {
  if (isMockMode()) return [];
  const rows = await getSql().query(`SELECT ${PUBLIC_FIELDS} FROM activity_map_features
    WHERE deleted_at IS NULL AND is_draft = FALSE AND geometry IS NOT NULL
    ORDER BY category, feature_type, activity_number NULLS LAST, lower(name), id`);
  return rows.map(publicActivityFeatureRecord);
}

export async function getAdminActivityMapFeatures() {
  await requirePermission('members');
  if (isMockMode()) return [];
  const rows = await getSql().query(`SELECT ${FIELDS} FROM activity_map_features
    WHERE deleted_at IS NULL ORDER BY is_draft DESC, category, feature_type, activity_number NULLS LAST, lower(name), id`);
  return rows.map(activityFeatureRecord);
}

export async function saveActivityMapFeature(input) {
  const user = await requirePermission('members');
  if (isMockMode()) throw new MapError('errors.activityMock', 409);
  const value = normalizeActivityFeatureInput(input);
  const sql = getSql();
  const actor = user.email.toLowerCase();
  let rows;
  if (value.action === 'create') {
    rows = await sql.query(`INSERT INTO activity_map_features
      (id, name, category, activity_number, feature_type, alpine_color, geometry, is_draft, last_changed_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9) RETURNING ${FIELDS}`,
    [randomId(), value.name, value.category, value.activityNumber, value.featureType, value.alpineColor,
      value.geometry ? JSON.stringify(value.geometry) : null, value.isDraft, actor]);
  } else if (value.action === 'update') {
    rows = await sql.query(`UPDATE activity_map_features SET name = $1, category = $2, activity_number = $3,
      feature_type = $4, alpine_color = $5, geometry = $6::jsonb, is_draft = $7, last_changed_by = $8
      WHERE id = $9 AND version = $10 AND deleted_at IS NULL RETURNING ${FIELDS}`,
    [value.name, value.category, value.activityNumber, value.featureType, value.alpineColor,
      value.geometry ? JSON.stringify(value.geometry) : null, value.isDraft, actor, value.id, value.version]);
  } else {
    rows = await sql.query(`UPDATE activity_map_features SET deleted_at = NOW(), last_changed_by = $1
      WHERE id = $2 AND version = $3 AND deleted_at IS NULL RETURNING ${FIELDS}`,
    [actor, value.id, value.version]);
  }
  if (!rows.length) throw new MapError('errors.activityChanged', 409);
  revalidatePublicActivityMap();
  return value.action === 'delete' ? null : activityFeatureRecord(rows[0]);
}
