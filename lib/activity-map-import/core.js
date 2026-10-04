import { randomUUID } from 'node:crypto';
import { ACTIVITY_MAP_SOURCE_IDS, CROSS_COUNTRY_CATEGORY } from '../activity-map-sources.js';
import { ACTIVITY_MAP_CENTER } from '../activity-map-display.js';
import { MapError } from '../map/errors.js';
import { ACTIVITY_IMPORT_RADIUS_KM } from './geometry.js';
import { fetchKartverketSkiRoutes } from './kartverket.js';
import { fetchOsmNordicRoutes } from './osm.js';
import { buildActivityImportPlan } from './plan.js';

export const ACTIVITY_IMPORT_MAX_SELECTED_ITEMS = 500;
const ID_PATTERN = /^[a-f0-9]{32}$/;
const SHA_PATTERN = /^[a-f0-9]{64}$/;
const randomId = () => randomUUID().replaceAll('-', '');

export function validateActivityImportSourceIds(input) {
  if (!Array.isArray(input) || !input.length || input.length > ACTIVITY_MAP_SOURCE_IDS.length) {
    throw new MapError('errors.activityImportSources');
  }
  const sourceIds = [...new Set(input)];
  if (sourceIds.length !== input.length || sourceIds.some((id) => !ACTIVITY_MAP_SOURCE_IDS.includes(id))) {
    throw new MapError('errors.activityImportSources');
  }
  return sourceIds.sort();
}

function candidateRows(plan) {
  return plan.candidates.map((candidate) => ({
    id: candidate.id, source_id: candidate.sourceId, external_id: candidate.externalId,
    source_external_id: candidate.sourceExternalId || candidate.externalId, source_url: candidate.sourceUrl || null,
    fingerprint: candidate.fingerprint, name: candidate.name, tooltip_text: candidate.tooltipText || null,
    operator_name: candidate.operator || null, website_url: candidate.websiteUrl || null,
    source_geometry: candidate.sourceGeometry || null, display_geometry: candidate.geometry || null,
    status: candidate.status, matched_feature_id: candidate.matchedFeatureId || null,
    matched_item_id: candidate.matchedItemId || null, match_score: candidate.matchScore || null,
    match_reason: candidate.matchReason || null,
  }));
}

async function fetchSource(sourceId, options) {
  if (sourceId === 'kartverket') return fetchKartverketSkiRoutes(options);
  return fetchOsmNordicRoutes(options);
}

export async function createActivityImportPreviewCore(input, {
  sql, actor, fetchImpl, signal, idGenerator = randomId, sourceFetcher = fetchSource,
}) {
  if (!input || input.action !== 'preview') throw new MapError('errors.activityImportAction');
  const sourceIds = validateActivityImportSourceIds(input.sourceIds);
  const runId = idGenerator();
  let plan;
  try {
    const [existingLinks, existingFeatures, sourceResults] = await Promise.all([
      sql.query(`SELECT fs.source_id, fs.external_id, fs.source_url, fs.fingerprint, fs.feature_id,
          f.name AS feature_name, f.geometry, f.geometry_origin
        FROM activity_map_feature_sources fs JOIN activity_map_features f ON f.id = fs.feature_id
        WHERE fs.source_id = ANY($1::text[]) AND f.deleted_at IS NULL`, [sourceIds]),
      sql.query(`SELECT id, name, geometry FROM activity_map_features
        WHERE deleted_at IS NULL AND geometry->>'type' = 'LineString'`),
      Promise.all(sourceIds.map((sourceId) => sourceFetcher(sourceId, { fetchImpl, signal }))),
    ]);
    plan = buildActivityImportPlan({ runId, sourceResults, existingLinks, existingFeatures });
  } catch (error) {
    const errorCode = error instanceof MapError ? error.code : 'errors.activityImportFailed';
    try {
      await sql.query(`INSERT INTO activity_map_source_runs
        (id, status, source_ids, center, radius_km, fetched_at, raw_sha256, plan_sha256, summary, error_code, created_by)
        VALUES ($1, 'failed', $2::jsonb, $3::jsonb, $4, NOW(), $5, $5, $6::jsonb, $7, $8)`,
      [runId, JSON.stringify(sourceIds), JSON.stringify(ACTIVITY_MAP_CENTER), ACTIVITY_IMPORT_RADIUS_KM,
        '0'.repeat(64), JSON.stringify({ total: 0 }), errorCode, actor]);
    } catch { /* The original safe error remains authoritative, including before migration. */ }
    throw error;
  }
  await sql.transaction((tx) => [
    tx.query(`INSERT INTO activity_map_source_runs
      (id, status, source_ids, center, radius_km, fetched_at, raw_sha256, plan_sha256, summary, created_by)
      VALUES ($1, 'preview', $2::jsonb, $3::jsonb, $4, $5, $6, $7, $8::jsonb, $9)`,
    [plan.runId, JSON.stringify(plan.sourceIds), JSON.stringify(plan.center), plan.radiusKm, plan.fetchedAt,
      plan.rawSha256, plan.planSha256, JSON.stringify(plan.summary), actor]),
    tx.query(`INSERT INTO activity_map_source_items
      (id, run_id, source_id, external_id, source_external_id, source_url, fingerprint, name, tooltip_text,
       operator_name, website_url, source_geometry, display_geometry, status, matched_feature_id,
       matched_item_id, match_score, match_reason)
      SELECT x.id, $1, x.source_id, x.external_id, x.source_external_id, x.source_url, x.fingerprint,
        x.name, x.tooltip_text, x.operator_name, x.website_url, x.source_geometry, x.display_geometry,
        x.status, x.matched_feature_id, x.matched_item_id, x.match_score, x.match_reason
      FROM jsonb_to_recordset($2::jsonb) AS x(
        id text, source_id text, external_id text, source_external_id text, source_url text, fingerprint text,
        name text, tooltip_text text, operator_name text, website_url text, source_geometry jsonb,
        display_geometry jsonb, status text, matched_feature_id text, matched_item_id text,
        match_score numeric, match_reason text)`, [plan.runId, JSON.stringify(candidateRows(plan))]),
  ]);
  return { id: plan.runId, status: 'preview', sourceIds: plan.sourceIds, center: plan.center,
    radiusKm: plan.radiusKm, fetchedAt: plan.fetchedAt, rawSha256: plan.rawSha256,
    planSha256: plan.planSha256, summary: plan.summary, candidates: plan.publicCandidates };
}

export function validateActivityImportApplyInput(input) {
  if (!input || input.action !== 'apply' || !ID_PATTERN.test(input.runId || '') || !SHA_PATTERN.test(input.planSha256 || '')
    || !Array.isArray(input.itemIds) || !input.itemIds.length || input.itemIds.length > ACTIVITY_IMPORT_MAX_SELECTED_ITEMS) {
    throw new MapError('errors.activityImportSelection');
  }
  const itemIds = [...new Set(input.itemIds)];
  if (itemIds.length !== input.itemIds.length || itemIds.some((id) => !ID_PATTERN.test(id))) throw new MapError('errors.activityImportSelection');
  return { runId: input.runId, planSha256: input.planSha256, itemIds };
}

export async function applyActivityImportCore(input, { sql, actor, idGenerator = randomId }) {
  const value = validateActivityImportApplyInput(input);
  const [run] = await sql.query(`SELECT id, status, plan_sha256 FROM activity_map_source_runs WHERE id = $1`, [value.runId]);
  if (!run || run.status !== 'preview' || run.plan_sha256 !== value.planSha256) throw new MapError('errors.activityImportChanged', 409);
  const items = await sql.query(`SELECT i.*, f.geometry_origin
    FROM activity_map_source_items i LEFT JOIN activity_map_features f ON f.id = i.matched_feature_id
    WHERE i.run_id = $1 AND (i.id = ANY($2::text[]) OR i.matched_item_id = ANY($2::text[]))`, [value.runId, value.itemIds]);
  const selected = items.filter((item) => value.itemIds.includes(item.id));
  if (selected.length !== value.itemIds.length || selected.some((item) => !['new', 'matched', 'changed'].includes(item.status)
    || item.matched_item_id || item.decision)) throw new MapError('errors.activityImportSelection');
  const actions = selected.map((item) => {
    const targetFeatureId = item.matched_feature_id || idGenerator();
    return { item_id: item.id, target_feature_id: targetFeatureId, create_feature: !item.matched_feature_id,
      update_geometry: Boolean(item.matched_feature_id && item.status === 'changed' && item.geometry_origin === 'external'),
      name: item.name, tooltip_text: item.tooltip_text, website_url: item.website_url,
      geometry: item.display_geometry, decision: !item.matched_feature_id ? 'imported'
        : item.status === 'changed' && item.geometry_origin === 'external' ? 'updated' : 'linked' };
  });
  const targets = new Map(actions.map((action) => [action.item_id, action.target_feature_id]));
  const linkedItems = items.filter((item) => targets.has(item.id) || targets.has(item.matched_item_id));
  const links = linkedItems.map((item) => ({ item_id: item.id,
    target_feature_id: targets.get(item.id) || targets.get(item.matched_item_id), source_id: item.source_id,
    external_id: item.external_id, source_url: item.source_url, fingerprint: item.fingerprint,
    decision: targets.has(item.id) ? actions.find((action) => action.item_id === item.id).decision : 'linked' }));
  const [, claimed] = await sql.transaction((tx) => [
    tx.query(`SELECT pg_advisory_xact_lock(hashtextextended('tfv:activity-map-source-apply', 0))`),
    tx.query(`UPDATE activity_map_source_runs SET status = 'applying'
      WHERE id = $1 AND status = 'preview' AND plan_sha256 = $2
        AND NOT EXISTS (SELECT 1 FROM activity_map_source_items
          WHERE run_id = $1 AND id = ANY($3::text[]) AND decision IS NOT NULL)
      RETURNING id`, [value.runId, value.planSha256, value.itemIds]),
    tx.query(`INSERT INTO activity_map_categories (id, name, color, last_changed_by)
      SELECT $2, $3, $4, $5 WHERE EXISTS (SELECT 1 FROM activity_map_source_runs WHERE id = $1 AND status = 'applying')
      ON CONFLICT (id) DO NOTHING`, [value.runId, CROSS_COUNTRY_CATEGORY.id, CROSS_COUNTRY_CATEGORY.name, CROSS_COUNTRY_CATEGORY.color, actor]),
    tx.query(`INSERT INTO activity_map_types (category, id, name, geometry_kind, last_changed_by)
      SELECT $2, $3, $4, $5, $6 WHERE EXISTS (SELECT 1 FROM activity_map_source_runs WHERE id = $1 AND status = 'applying')
      ON CONFLICT (category, id) DO NOTHING`, [value.runId, CROSS_COUNTRY_CATEGORY.id, CROSS_COUNTRY_CATEGORY.type.id,
      CROSS_COUNTRY_CATEGORY.type.name, CROSS_COUNTRY_CATEGORY.type.geometryKind, actor]),
    tx.query(`WITH actions AS (
        SELECT * FROM jsonb_to_recordset($2::jsonb) AS x(item_id text, target_feature_id text,
          create_feature boolean, update_geometry boolean, name text, tooltip_text text, website_url text,
          geometry jsonb, decision text)
      ), created AS (
        INSERT INTO activity_map_features
          (id, name, tooltip_text, category, feature_type, geometry, is_draft, season, website_url,
           geometry_origin, last_changed_by)
        SELECT target_feature_id, name, tooltip_text, 'cross_country', 'route', geometry, TRUE, 'winter',
          website_url, 'external', $3 FROM actions
        WHERE create_feature AND EXISTS (SELECT 1 FROM activity_map_source_runs WHERE id = $1 AND status = 'applying')
        RETURNING id
      ), updated AS (
        UPDATE activity_map_features f SET geometry = actions.geometry, geometry_origin = 'external',
          is_draft = TRUE, last_changed_by = $3
        FROM actions WHERE f.id = actions.target_feature_id AND actions.update_geometry
          AND f.deleted_at IS NULL AND f.geometry_origin = 'external'
          AND EXISTS (SELECT 1 FROM activity_map_source_runs WHERE id = $1 AND status = 'applying')
        RETURNING f.id
      ), links AS (
        SELECT * FROM jsonb_to_recordset($4::jsonb) AS x(item_id text, target_feature_id text,
          source_id text, external_id text, source_url text, fingerprint text, decision text)
      ), linked AS (
        INSERT INTO activity_map_feature_sources
          (feature_id, source_id, external_id, source_url, fingerprint, last_seen_at, last_changed_by)
        SELECT target_feature_id, source_id, external_id, source_url, fingerprint, NOW(), $3 FROM links
        WHERE EXISTS (SELECT 1 FROM activity_map_source_runs WHERE id = $1 AND status = 'applying')
        ON CONFLICT (source_id, external_id) DO UPDATE SET feature_id = EXCLUDED.feature_id,
          source_url = EXCLUDED.source_url, fingerprint = EXCLUDED.fingerprint,
          last_seen_at = NOW(), last_changed_by = EXCLUDED.last_changed_by
        RETURNING source_id, external_id
      ), reviewed AS (
        UPDATE activity_map_source_items i SET decision = links.decision, feature_id = links.target_feature_id,
          reviewed_at = NOW(), reviewed_by = $3
        FROM links WHERE i.id = links.item_id AND i.run_id = $1
        RETURNING i.id
      )
      UPDATE activity_map_source_runs SET status = 'applied', applied_at = NOW(), applied_by = $3,
        summary = summary || jsonb_build_object('applied', (SELECT count(*) FROM reviewed))
      WHERE id = $1 AND status = 'applying' RETURNING id`,
    [value.runId, JSON.stringify(actions), actor, JSON.stringify(links)]),
  ]);
  if (!claimed.length) throw new MapError('errors.activityImportChanged', 409);
  return { id: value.runId, status: 'applied', imported: actions.filter((item) => item.create_feature).length,
    updated: actions.filter((item) => item.update_geometry).length,
    linked: actions.filter((item) => !item.create_feature && !item.update_geometry).length,
    sourcesLinked: links.length };
}

export async function rejectActivityImportItemsCore(input, { sql, actor }) {
  if (!input || input.action !== 'reject' || !ID_PATTERN.test(input.runId || '') || !Array.isArray(input.itemIds)
    || !input.itemIds.length || input.itemIds.length > ACTIVITY_IMPORT_MAX_SELECTED_ITEMS
    || input.itemIds.some((id) => !ID_PATTERN.test(id))) throw new MapError('errors.activityImportSelection');
  const itemIds = [...new Set(input.itemIds)];
  if (itemIds.length !== input.itemIds.length) throw new MapError('errors.activityImportSelection');
  const rows = await sql.query(`UPDATE activity_map_source_items i
    SET decision = 'rejected', reviewed_at = NOW(), reviewed_by = $3
    WHERE i.run_id = $1 AND i.id = ANY($2::text[]) AND i.decision IS NULL AND i.matched_item_id IS NULL
      AND i.status IN ('new', 'matched', 'changed')
      AND EXISTS (SELECT 1 FROM activity_map_source_runs r WHERE r.id = i.run_id AND r.status = 'preview')
    RETURNING i.id`, [input.runId, itemIds, actor]);
  if (rows.length !== itemIds.length) throw new MapError('errors.activityImportChanged', 409);
  return { rejected: rows.length };
}
