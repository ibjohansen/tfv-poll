import 'server-only';

import { randomUUID } from 'node:crypto';
import { requirePermission } from './admin-access.js';
import { deleteCmsObject, isCmsStorageConfigured, uploadCmsObject } from './cms-storage.js';
import { getSql } from './db.js';
import { revalidatePublicActivityMap } from './public-content-cache.js';
import { validateActivityMapIcon } from './upload-validation.js';
import { getActivityMapCatalog } from './activity-map-catalog-service.js';
import { ACTIVITY_MAP_CATALOG_KINDS } from './activity-map-catalog.js';
import { MapError } from './map/geo.js';

const validId = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value);

export function normalizeActivityMapIconIdentity(input) {
  const kind = String(input?.kind || '');
  const id = String(input?.id || '');
  const category = kind === 'category' ? id : String(input?.category || '');
  const featureType = kind === 'subtype' ? String(input?.featureType || '') : null;
  if (!ACTIVITY_MAP_CATALOG_KINDS.includes(kind) || !validId(id) || !validId(category)
    || (kind === 'subtype' && !validId(featureType))) throw new MapError('errors.activityIconIdentity');
  return { kind, id, category, featureType };
}

function versionOf(input) {
  const version = Number(input?.version);
  if (!Number.isInteger(version) || version < 1) throw new MapError('errors.activityIdentity');
  return version;
}

async function findCatalogIconRecord(sql, identity) {
  if (identity.kind === 'category') {
    return (await sql.query('SELECT icon_key, version FROM activity_map_categories WHERE id = $1', [identity.id]))[0] || null;
  }
  if (identity.kind === 'type') {
    return (await sql.query('SELECT icon_key, version FROM activity_map_types WHERE category = $1 AND id = $2', [identity.category, identity.id]))[0] || null;
  }
  return (await sql.query('SELECT icon_key, version FROM activity_map_subtypes WHERE category = $1 AND feature_type = $2 AND id = $3',
    [identity.category, identity.featureType, identity.id]))[0] || null;
}

async function setCatalogIconKey(sql, identity, version, iconKey, actor) {
  if (identity.kind === 'category') {
    return sql.query(`UPDATE activity_map_categories SET icon_key = $1, last_changed_by = $2
      WHERE id = $3 AND version = $4 RETURNING icon_key`, [iconKey, actor, identity.id, version]);
  }
  if (identity.kind === 'type') {
    return sql.query(`UPDATE activity_map_types SET icon_key = $1, last_changed_by = $2
      WHERE category = $3 AND id = $4 AND version = $5 RETURNING icon_key`, [iconKey, actor, identity.category, identity.id, version]);
  }
  return sql.query(`UPDATE activity_map_subtypes SET icon_key = $1, last_changed_by = $2
    WHERE category = $3 AND feature_type = $4 AND id = $5 AND version = $6 RETURNING icon_key`,
  [iconKey, actor, identity.category, identity.featureType, identity.id, version]);
}

export async function getActivityMapCatalogIcon(input) {
  const identity = normalizeActivityMapIconIdentity(input);
  const record = await findCatalogIconRecord(getSql(), identity);
  return record?.icon_key ? { storageKey: record.icon_key } : null;
}

export async function uploadActivityMapCatalogIcon(input, file) {
  const user = await requirePermission('members');
  if (!isCmsStorageConfigured()) throw new MapError('errors.activityIconStorage', 503);
  const identity = normalizeActivityMapIconIdentity(input);
  const version = versionOf(input);
  const sql = getSql();
  const current = await findCatalogIconRecord(sql, identity);
  if (!current || Number(current.version) !== version) throw new MapError('errors.activityCatalogChanged', 409);
  const icon = await validateActivityMapIcon(file).catch(() => { throw new MapError('errors.activityIconFile'); });
  const iconKey = `activity-map/icons/${randomUUID().replaceAll('-', '')}.svg`;
  await uploadCmsObject(iconKey, icon.bytes, icon.mimeType).catch((error) => {
    if (error.message === 'CMS storage is not configured') throw new MapError('errors.activityIconStorage', 503);
    throw error;
  });
  try {
    const changed = await setCatalogIconKey(sql, identity, version, iconKey, user.email.toLowerCase());
    if (!changed.length) throw new MapError('errors.activityCatalogChanged', 409);
  } catch (error) {
    await deleteCmsObject(iconKey).catch(() => {});
    throw error;
  }
  if (current.icon_key) await deleteCmsObject(current.icon_key).catch(() => {});
  revalidatePublicActivityMap();
  return getActivityMapCatalog();
}

export async function removeActivityMapCatalogIcon(input) {
  const user = await requirePermission('members');
  const identity = normalizeActivityMapIconIdentity(input);
  const version = versionOf(input);
  const sql = getSql();
  const current = await findCatalogIconRecord(sql, identity);
  if (!current || Number(current.version) !== version) throw new MapError('errors.activityCatalogChanged', 409);
  if (!current.icon_key) throw new MapError('errors.activityIconMissing', 404);
  const changed = await setCatalogIconKey(sql, identity, version, null, user.email.toLowerCase());
  if (!changed.length) throw new MapError('errors.activityCatalogChanged', 409);
  await deleteCmsObject(current.icon_key).catch(() => {});
  revalidatePublicActivityMap();
  return getActivityMapCatalog();
}
