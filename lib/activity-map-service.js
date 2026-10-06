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

const PUBLIC_FIELDS = 'id, name, tooltip_text, category, activity_number, feature_type, feature_subtype, alpine_color, geometry, season, website_url, image_storage_key, image_source_url, image_mime_type, image_size_bytes, image_credit, icon_override_kind, icon_override_category, icon_override_type, icon_override_subtype';
const FIELDS = `${PUBLIC_FIELDS}, is_draft, version, geometry_origin`;
const CATALOG_FIELDS = `c.name AS category_name, c.color AS category_color, c.icon_key AS category_icon_key,
  t.name AS type_name, t.geometry_kind, t.icon_key AS type_icon_key,
  s.name AS subtype_name, s.icon_key AS subtype_icon_key,
  CASE f.icon_override_kind
    WHEN 'category' THEN (SELECT oc.icon_key FROM activity_map_categories oc WHERE oc.id = f.icon_override_category)
    WHEN 'type' THEN (SELECT ot.icon_key FROM activity_map_types ot WHERE ot.category = f.icon_override_category AND ot.id = f.icon_override_type)
    WHEN 'subtype' THEN (SELECT os.icon_key FROM activity_map_subtypes os WHERE os.category = f.icon_override_category AND os.feature_type = f.icon_override_type AND os.id = f.icon_override_subtype)
  END AS override_icon_key`;
const CATALOG_JOIN = 'JOIN activity_map_categories c ON c.id = f.category JOIN activity_map_types t ON t.category = f.category AND t.id = f.feature_type';
const SUBTYPE_JOIN = 'LEFT JOIN activity_map_subtypes s ON s.category = f.category AND s.feature_type = f.feature_type AND s.id = f.feature_subtype';
const SOURCE_FIELDS = `ARRAY(SELECT fs.source_id FROM activity_map_feature_sources fs
  WHERE fs.feature_id = f.id ORDER BY CASE fs.source_id WHEN 'kartverket' THEN 10 ELSE 20 END, fs.source_id) AS source_ids`;

export async function getPublicActivityMapFeatures() {
  if (isMockMode()) return [];
  const rows = await getSql().query(`SELECT ${PUBLIC_FIELDS.split(', ').map((field) => `f.${field}`).join(', ')}, ${CATALOG_FIELDS}, ${SOURCE_FIELDS}
    FROM activity_map_features f ${CATALOG_JOIN} ${SUBTYPE_JOIN}
    WHERE deleted_at IS NULL AND is_draft = FALSE AND geometry IS NOT NULL
    ORDER BY f.category, feature_type, activity_number NULLS LAST, lower(f.name), f.id`);
  return rows.map(publicActivityFeatureRecord);
}

export async function getAdminActivityMapFeatures() {
  await requirePermission('members');
  if (isMockMode()) return [];
  const rows = await getSql().query(`SELECT ${FIELDS.split(', ').map((field) => `f.${field}`).join(', ')}, ${CATALOG_FIELDS}, ${SOURCE_FIELDS}
    FROM activity_map_features f ${CATALOG_JOIN} ${SUBTYPE_JOIN}
    WHERE deleted_at IS NULL ORDER BY is_draft DESC, f.category, feature_type, activity_number NULLS LAST, lower(f.name), f.id`);
  return rows.map(activityFeatureRecord);
}

export async function getAdminActivityMapFeature(id) {
  await requirePermission('members');
  if (!/^[a-f0-9]{32}$/.test(id || '') || isMockMode()) return null;
  const rows = await getSql().query(`SELECT ${FIELDS.split(', ').map((field) => `f.${field}`).join(', ')}, ${CATALOG_FIELDS}, ${SOURCE_FIELDS}
    FROM activity_map_features f ${CATALOG_JOIN} ${SUBTYPE_JOIN}
    WHERE f.id = $1 AND f.deleted_at IS NULL`, [id]);
  if (!rows.length) return null;
  return withActivityCatalog(activityFeatureRecord(rows[0]), await getActivityMapCatalog());
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
      (id, name, tooltip_text, category, activity_number, feature_type, feature_subtype, alpine_color, geometry, is_draft, last_changed_by, season, website_url,
        icon_override_kind, icon_override_category, icon_override_type, icon_override_subtype, image_credit, geometry_origin)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'manual') RETURNING ${FIELDS}`,
    [randomId(), value.name, value.tooltipText, value.category, value.activityNumber, value.featureType, value.featureSubtype, value.alpineColor,
      value.geometry ? JSON.stringify(value.geometry) : null, value.isDraft, actor, value.season, value.websiteUrl,
      value.iconOverride.kind, value.iconOverride.category, value.iconOverride.featureType, value.iconOverride.featureSubtype, value.imageCredit]);
  } else if (value.action === 'update') {
    rows = await sql.query(`UPDATE activity_map_features SET name = $1, tooltip_text = $2, category = $3, activity_number = $4,
      feature_type = $5, feature_subtype = $6, alpine_color = $7, geometry = $8::jsonb, is_draft = $9, last_changed_by = $10, season = $13, website_url = $14,
      icon_override_kind = $15, icon_override_category = $16, icon_override_type = $17, icon_override_subtype = $18,
      image_credit = $19,
      geometry_origin = CASE WHEN category = $3 AND feature_type = $5 AND feature_subtype IS NOT DISTINCT FROM $6 AND geometry IS NOT DISTINCT FROM $8::jsonb
        THEN geometry_origin ELSE 'manual' END
      WHERE id = $11 AND version = $12 AND deleted_at IS NULL RETURNING ${FIELDS}`,
    [value.name, value.tooltipText, value.category, value.activityNumber, value.featureType, value.featureSubtype, value.alpineColor,
      value.geometry ? JSON.stringify(value.geometry) : null, value.isDraft, actor, value.id, value.version, value.season, value.websiteUrl,
      value.iconOverride.kind, value.iconOverride.category, value.iconOverride.featureType, value.iconOverride.featureSubtype, value.imageCredit]);
  } else {
    rows = await sql.query(`UPDATE activity_map_features SET deleted_at = NOW(), last_changed_by = $1
      WHERE id = $2 AND version = $3 AND deleted_at IS NULL RETURNING ${FIELDS}`,
    [actor, value.id, value.version]);
  }
  if (!rows.length) throw new MapError('errors.activityChanged', 409);
  revalidatePublicActivityMap();
  return value.action === 'delete' ? null : withActivityCatalog(activityFeatureRecord(rows[0]), catalog);
}
