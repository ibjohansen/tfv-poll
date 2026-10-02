import 'server-only';
import { requirePermission } from './admin-access.js';
import { getSql } from './db.js';
import { isMockMode } from './mock-store.js';
import { randomId } from './member-self-service-utils.js';
import { revalidatePublicActivityMap } from './public-content-cache.js';
import { activityFeatureRecord, normalizeActivityFeatureInput, publicActivityFeatureRecord } from './activity-map.js';
import { MapError } from './map/geo.js';
import { getActivityMapCatalog } from './activity-map-catalog-service.js';
import { withActivityCatalog } from './activity-map-catalog.js';

const PUBLIC_FIELDS = 'id, name, tooltip_text, category, activity_number, feature_type, alpine_color, geometry';
const FIELDS = `${PUBLIC_FIELDS}, is_draft, version`;
const CATALOG_FIELDS = 'c.name AS category_name, c.color AS category_color, t.name AS type_name, t.geometry_kind';
const CATALOG_JOIN = 'JOIN activity_map_categories c ON c.id = f.category JOIN activity_map_types t ON t.category = f.category AND t.id = f.feature_type';

export async function getPublicActivityMapFeatures() {
  if (isMockMode()) return [];
  const rows = await getSql().query(`SELECT ${PUBLIC_FIELDS.split(', ').map((field) => `f.${field}`).join(', ')}, ${CATALOG_FIELDS}
    FROM activity_map_features f ${CATALOG_JOIN}
    WHERE deleted_at IS NULL AND is_draft = FALSE AND geometry IS NOT NULL
    ORDER BY f.category, feature_type, activity_number NULLS LAST, lower(f.name), f.id`);
  return rows.map(publicActivityFeatureRecord);
}

export async function getAdminActivityMapFeatures() {
  await requirePermission('members');
  if (isMockMode()) return [];
  const rows = await getSql().query(`SELECT ${FIELDS.split(', ').map((field) => `f.${field}`).join(', ')}, ${CATALOG_FIELDS}
    FROM activity_map_features f ${CATALOG_JOIN}
    WHERE deleted_at IS NULL ORDER BY is_draft DESC, f.category, feature_type, activity_number NULLS LAST, lower(f.name), f.id`);
  return rows.map(activityFeatureRecord);
}

export async function saveActivityMapFeature(input) {
  const user = await requirePermission('members');
  if (isMockMode()) throw new MapError('errors.activityMock', 409);
  const catalog = await getActivityMapCatalog();
  const value = normalizeActivityFeatureInput(input, catalog);
  const sql = getSql();
  const actor = user.email.toLowerCase();
  let rows;
  if (value.action === 'create') {
    rows = await sql.query(`INSERT INTO activity_map_features
      (id, name, tooltip_text, category, activity_number, feature_type, alpine_color, geometry, is_draft, last_changed_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10) RETURNING ${FIELDS}`,
    [randomId(), value.name, value.tooltipText, value.category, value.activityNumber, value.featureType, value.alpineColor,
      value.geometry ? JSON.stringify(value.geometry) : null, value.isDraft, actor]);
  } else if (value.action === 'update') {
    rows = await sql.query(`UPDATE activity_map_features SET name = $1, tooltip_text = $2, category = $3, activity_number = $4,
      feature_type = $5, alpine_color = $6, geometry = $7::jsonb, is_draft = $8, last_changed_by = $9
      WHERE id = $10 AND version = $11 AND deleted_at IS NULL RETURNING ${FIELDS}`,
    [value.name, value.tooltipText, value.category, value.activityNumber, value.featureType, value.alpineColor,
      value.geometry ? JSON.stringify(value.geometry) : null, value.isDraft, actor, value.id, value.version]);
  } else {
    rows = await sql.query(`UPDATE activity_map_features SET deleted_at = NOW(), last_changed_by = $1
      WHERE id = $2 AND version = $3 AND deleted_at IS NULL RETURNING ${FIELDS}`,
    [actor, value.id, value.version]);
  }
  if (!rows.length) throw new MapError('errors.activityChanged', 409);
  revalidatePublicActivityMap();
  return value.action === 'delete' ? null : withActivityCatalog(activityFeatureRecord(rows[0]), catalog);
}
