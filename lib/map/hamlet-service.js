import 'server-only';
import { requirePermission } from '../admin-access.js';
import { getSql } from '../db.js';
import { isMockMode } from '../mock-store.js';
import { MapError } from './geo.js';
import { hamletRecord, normalizeHamletInput } from './hamlets.js';

const fields = 'id, name, polygon, polygon_reviewed, polygon_version, polygon_updated_at';

export async function getMapHamlets() {
  await requirePermission('members');
  if (isMockMode()) return [];
  const rows = await getSql().query(`SELECT ${fields} FROM member_hamlets WHERE deleted_at IS NULL ORDER BY lower(name), id`);
  return rows.map(hamletRecord);
}

export async function saveMapHamlet(input) {
  const user = await requirePermission('members');
  const value = normalizeHamletInput(input);
  if (isMockMode()) throw new MapError('Grender kan ikke lagres i demonstrasjonsmodus.', 409);
  const sql = getSql();
  const geometry = value.geometry ? JSON.stringify(value.geometry) : null;
  const metadata = JSON.stringify({ action: `hamlet_polygon_${value.action}`, kind: 'hamlet',
    reviewed: value.reviewed, vertices: value.vertices, area_m2: value.areaM2 });
  try {
    // A single statement makes geometry and the minimal actor log atomic.
    // UPDATE's version predicate is rechecked after any concurrent row lock.
    const change = value.action === 'create'
      ? `INSERT INTO member_hamlets (name, polygon, polygon_reviewed, polygon_updated_at)
         VALUES ($1, $2::jsonb, $3, NOW()) RETURNING ${fields}`
      : `UPDATE member_hamlets SET name = COALESCE($1::text, name), polygon = $2::jsonb, polygon_reviewed = $3
         WHERE id = $6 AND polygon_version = $7 AND deleted_at IS NULL RETURNING ${fields}`;
    const params = [value.name, geometry, value.reviewed, user.email.toLowerCase(), metadata];
    if (value.action !== 'create') params.push(value.id, value.version);
    const rows = await sql.query(`WITH changed AS (${change}), audited AS (
      INSERT INTO audit_log (table_name, row_id, operation, changed_by, after_value)
      SELECT 'admin_actions', id::text, 'INSERT', $4, $5::jsonb || jsonb_build_object(
        'group_id', id, 'name', name, 'version', polygon_version) FROM changed
    ) SELECT * FROM changed`, params);
    if (!rows.length) throw new MapError('Grenden er endret eller slettet av en annen administrator. Last grendelisten på nytt. Utkastet ditt er beholdt.', 409);
    return hamletRecord(rows[0]);
  } catch (error) {
    if ((error.code || error.cause?.code) === '23505') throw new MapError('Det finnes allerede en grend med dette navnet. Velg den fra listen for å knytte til polygonet.', 409);
    throw error;
  }
}
