import 'server-only';
import { requirePermission } from '../admin-access.js';
import { getSql } from '../db.js';
import { isMockMode } from '../mock-store.js';
import { MapError } from './geo.js';
import { hamletRecord, normalizeHamletInput } from './hamlets.js';
import { searchMapData } from './service.js';

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

function normalizeMemberSyncInput(input) {
  const id = String(input?.id || '');
  const version = input?.version;
  if (input?.action !== 'sync_members' || !/^[1-9][0-9]{0,15}$/.test(id)
    || !Number.isInteger(version) || version < 1 || version >= 2147483647) {
    throw new MapError('Velg en gyldig, lagret grend.');
  }
  return { id, version };
}

export async function syncMapHamletMembers(input, { signal } = {}) {
  const user = await requirePermission('members');
  const value = normalizeMemberSyncInput(input);
  if (isMockMode()) throw new MapError('Medlemskoblinger kan ikke endres i demonstrasjonsmodus.', 409);
  const sql = getSql();
  const [hamlet] = await sql.query(`SELECT ${fields} FROM member_hamlets
    WHERE id = $1 AND polygon_version = $2 AND deleted_at IS NULL`, [value.id, value.version]);
  if (!hamlet) throw new MapError('Grenden er endret eller slettet. Last grendelisten på nytt.', 409);
  if (!hamlet.polygon) throw new MapError('Grenden mangler et lagret polygon.', 409);
  if (!hamlet.polygon_reviewed) throw new MapError('Kontroller og lagre grendepolygonet før registeret kobles.', 409);

  const result = await searchMapData({ datatype: 'comparison', polygon: hamlet.polygon }, { signal });
  const memberIds = [...new Set(result.comparison.rows
    .filter((row) => row.status === 'MATCH' && row.scope === 'address_in_polygon' && row.register?.id)
    .map((row) => String(row.register.id))
    .filter((id) => /^[1-9][0-9]{0,15}$/.test(id)))];
  const actor = user.email.trim().toLowerCase();
  const [summary] = await sql.query(`WITH target AS MATERIALIZED (
      SELECT id FROM member_hamlets
      WHERE id = $1 AND polygon_version = $2 AND polygon_reviewed = TRUE
        AND polygon IS NOT NULL AND deleted_at IS NULL
      FOR UPDATE
    ), candidate_ids AS (
      SELECT value::bigint AS id FROM jsonb_array_elements_text($3::jsonb)
    ), inspected AS MATERIALIZED (
      SELECT m.id, m.hamlet_id FROM members m JOIN candidate_ids c USING (id)
      WHERE m.deleted_at IS NULL
    ), changed AS (
      UPDATE members m SET hamlet_id = $1, last_changed_by = $4
      FROM target, inspected i
      WHERE m.id = i.id AND m.hamlet_id IS NULL
      RETURNING m.id
    ), totals AS (
      SELECT count(*)::int AS matched_count,
        count(*) FILTER (WHERE hamlet_id = $1)::int AS already_linked_count,
        count(*) FILTER (WHERE hamlet_id IS NOT NULL AND hamlet_id <> $1)::int AS assigned_elsewhere_count
      FROM inspected
    ), changed_total AS (
      SELECT count(*)::int AS linked_count FROM changed
    ), audited AS (
      INSERT INTO audit_log (table_name, row_id, operation, changed_by, after_value)
      SELECT 'admin_actions', target.id::text, 'INSERT', $4,
        jsonb_build_object('action', 'hamlet_members_sync', 'kind', 'hamlet', 'group_id', target.id,
          'matched_count', totals.matched_count, 'linked_count', changed_total.linked_count,
          'already_linked_count', totals.already_linked_count,
          'assigned_elsewhere_count', totals.assigned_elsewhere_count)
      FROM target CROSS JOIN totals CROSS JOIN changed_total
      RETURNING id
    )
    SELECT (SELECT count(*)::int FROM target) AS target_count,
      totals.*, changed_total.linked_count
    FROM totals CROSS JOIN changed_total`, [value.id, value.version, JSON.stringify(memberIds), actor]);
  if (!summary?.target_count) throw new MapError('Grenden ble endret mens koblingen pågikk. Last grendelisten på nytt.', 409);
  return {
    hamletId: value.id,
    matchedCount: summary.matched_count,
    linkedCount: summary.linked_count,
    alreadyLinkedCount: summary.already_linked_count,
    assignedElsewhereCount: summary.assigned_elsewhere_count,
  };
}
