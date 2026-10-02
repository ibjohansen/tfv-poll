import 'server-only';
import { requirePermission } from './admin-access.js';
import { getSql } from './db.js';
import { isMockMode } from './mock-store.js';
import { randomId } from './member-self-service-utils.js';
import { revalidatePublicActivityMap } from './public-content-cache.js';
import { DEFAULT_ACTIVITY_CATALOG, normalizeActivityCatalogInput } from './activity-map-catalog.js';
import { MapError } from './map/geo.js';

export async function getActivityMapCatalog() {
  if (isMockMode()) return DEFAULT_ACTIVITY_CATALOG;
  const sql = getSql();
  const [categories, types] = await Promise.all([
    sql.query('SELECT id, name, color, version FROM activity_map_categories ORDER BY lower(name), id'),
    sql.query('SELECT id, category, name, geometry_kind AS "geometryKind", version FROM activity_map_types ORDER BY lower(name), id'),
  ]);
  return { categories, types };
}

export async function saveActivityMapCatalogEntry(input) {
  const user = await requirePermission('members');
  if (isMockMode()) throw new MapError('errors.activityMock', 409);
  const value = normalizeActivityCatalogInput(input);
  const actor = user.email.toLowerCase();
  const sql = getSql();
  let rows;
  try {
    if (value.kind === 'category') {
      rows = value.action === 'create'
        ? await sql.query(`INSERT INTO activity_map_categories (id, name, color, last_changed_by)
          VALUES ($1, $2, $3, $4) RETURNING id`, [randomId(), value.name, value.color, actor])
        : await sql.query(`UPDATE activity_map_categories SET name = $1, color = $2, last_changed_by = $3
          WHERE id = $4 AND version = $5 RETURNING id`, [value.name, value.color, actor, value.id, value.version]);
    } else {
      rows = value.action === 'create'
        ? await sql.query(`INSERT INTO activity_map_types (id, category, name, geometry_kind, last_changed_by)
          VALUES ($1, $2, $3, $4, $5) RETURNING id`, [randomId(), value.category, value.name, value.geometryKind, actor])
        : await sql.query(`UPDATE activity_map_types SET name = $1, last_changed_by = $2
          WHERE category = $3 AND id = $4 AND version = $5 AND geometry_kind = $6 RETURNING id`,
        [value.name, actor, value.category, value.id, value.version, value.geometryKind]);
    }
  } catch (error) {
    if (error.code === '23505') throw new MapError('errors.activityCatalogDuplicate', 409);
    if (error.code === '23503') throw new MapError('errors.activityCategory');
    throw error;
  }
  if (!rows.length) throw new MapError('errors.activityCatalogChanged', 409);
  revalidatePublicActivityMap();
  return getActivityMapCatalog();
}
