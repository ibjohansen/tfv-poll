import { neon } from '@neondatabase/serverless';
import { compareRegisterWithMapData } from '../lib/map/comparison.js';
import { findAddressesInPolygon } from '../lib/map/kartverket-address-service.js';
import { cadastralInteger, normalizeCadastral, nullableText } from '../lib/map/normalization.js';

const apply = process.argv.includes('--apply');
const actor = 'system:hamlet-assignment-2026-09-16';

function registerProperty(row) {
  const cadastral = normalizeCadastral(row.cadastral_number || '');
  return {
    id: String(row.id),
    address: nullableText(row.street_address),
    hNumber: nullableText(row.h_number),
    ...cadastral,
    snr: cadastralInteger(row.section_number) ?? cadastral.snr,
    municipalityNumber: '3320',
    source: 'Turufjell vel',
    owners: [],
  };
}

async function mapWithConcurrency(values, concurrency, callback) {
  const results = new Array(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next++;
      results[index] = await callback(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

try {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url || new URL(url).hostname.includes('-pooler')) throw new Error('DATABASE_URL_UNPOOLED mangler eller er en pooled URL');
  if (!['development', 'staging', 'production'].includes(process.env.APP_ENVIRONMENT)) {
    throw new Error('APP_ENVIRONMENT må være development, staging eller production');
  }
  if (apply && process.env.HAMLET_ASSIGNMENT_CONFIRMED !== 'true') {
    throw new Error('Sett HAMLET_ASSIGNMENT_CONFIRMED=true for å lagre den kontrollerte engangskoblingen');
  }
  const sql = neon(url);
  const [database] = await sql`SELECT environment FROM application_environment WHERE singleton = TRUE`;
  if (!database || database.environment !== process.env.APP_ENVIRONMENT) {
    throw new Error(`Database environment mismatch: ${database?.environment || 'ukjent'}`);
  }
  const hamlets = await sql`
    SELECT id, name, polygon, polygon_version
    FROM member_hamlets
    WHERE deleted_at IS NULL AND polygon IS NOT NULL AND polygon_reviewed = TRUE
    ORDER BY id
  `;
  const members = await sql`
    SELECT id, h_number, cadastral_number, section_number, street_address, hamlet_id
    FROM members WHERE deleted_at IS NULL ORDER BY id
  `;
  if (!hamlets.length || members.length > 5000) throw new Error('Uventet datamengde for grendekobling');
  const register = members.map(registerProperty);
  const results = await mapWithConcurrency(hamlets, 3, async (hamlet) => {
    const official = await findAddressesInPolygon(hamlet.polygon);
    if (!official.complete) throw new Error(`Ufullstendig adressegrunnlag for grend ${hamlet.id}`);
    const comparison = compareRegisterWithMapData(register, official.addresses, { polygon: hamlet.polygon });
    const memberIds = [...new Set(comparison.rows
      .filter((row) => row.status === 'MATCH' && row.scope === 'address_in_polygon' && row.register?.id)
      .map((row) => String(row.register.id)))];
    return {
      id: String(hamlet.id), name: hamlet.name, version: Number(hamlet.polygon_version),
      officialAddresses: comparison.officialCount, memberIds,
    };
  });
  const candidates = new Map();
  for (const result of results) for (const memberId of result.memberIds) {
    candidates.set(memberId, [...(candidates.get(memberId) || []), result.id]);
  }
  const assignments = [...candidates]
    .filter(([, hamletIds]) => hamletIds.length === 1)
    .map(([memberId, [hamletId]]) => ({ member_id: memberId, hamlet_id: hamletId }));
  const ambiguous = [...candidates.values()].filter((hamletIds) => hamletIds.length > 1).length;
  const matched = new Set(assignments.map((assignment) => assignment.member_id));
  const unassigned = members.filter((member) => !matched.has(String(member.id))).length;
  const currentByMember = new Map(members.map((member) => [String(member.id), member.hamlet_id && String(member.hamlet_id)]));
  const pending = assignments.filter((assignment) => !currentByMember.get(assignment.member_id));
  const conflicts = assignments.filter((assignment) => currentByMember.get(assignment.member_id)
    && currentByMember.get(assignment.member_id) !== assignment.hamlet_id).length;
  const report = {
    environment: database.environment,
    mode: apply ? 'apply' : 'preview',
    hamlets: results.map((result) => ({ id: result.id, name: result.name,
      officialAddresses: result.officialAddresses, exactMemberMatches: result.memberIds.length })),
    activeMembers: members.length,
    uniqueAssignments: assignments.length,
    pendingAssignments: pending.length,
    ambiguousMembers: ambiguous,
    unassignedMembers: unassigned,
    conflictingExistingAssignments: conflicts,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!apply) {
    console.log('Forhåndsvisning: ingen endringer. Legg til --apply og HAMLET_ASSIGNMENT_CONFIRMED=true for å lagre.');
  } else {
    if (ambiguous || conflicts) throw new Error('Tvetydige eller motstridende grendekoblinger må avklares før lagring');
    const expectedHamlets = results.map((result) => ({ id: result.id, version: result.version }));
    const [stored] = await sql.query(`WITH expected AS (
        SELECT id, version FROM jsonb_to_recordset($1::jsonb) AS value(id bigint, version integer)
      ), assignments AS (
        SELECT member_id, hamlet_id FROM jsonb_to_recordset($2::jsonb) AS value(member_id bigint, hamlet_id bigint)
      ), valid AS (
        SELECT NOT EXISTS (
          SELECT 1 FROM expected e LEFT JOIN member_hamlets h ON h.id = e.id
          WHERE h.id IS NULL OR h.deleted_at IS NOT NULL OR h.polygon_reviewed IS NOT TRUE
            OR h.polygon IS NULL OR h.polygon_version <> e.version
        ) AND (SELECT count(*) FROM expected) = (SELECT count(*) FROM member_hamlets
          WHERE deleted_at IS NULL AND polygon IS NOT NULL AND polygon_reviewed = TRUE) AS ok
      ), changed AS (
        UPDATE members m SET hamlet_id = a.hamlet_id, last_changed_by = $3
        FROM assignments a, valid
        WHERE valid.ok AND m.id = a.member_id AND m.deleted_at IS NULL AND m.hamlet_id IS NULL
        RETURNING m.id, m.hamlet_id
      ), audited AS (
        INSERT INTO audit_log (table_name, row_id, operation, changed_by, after_value)
        SELECT 'admin_actions', 'hamlet-bulk-assignment-2026-09-16', 'INSERT', $3,
          jsonb_build_object('action', 'hamlet_members_bulk_assignment', 'changed_count', count(*),
            'hamlet_count', $4::integer, 'unassigned_count', $5::integer)
        FROM changed
        RETURNING id
      )
      SELECT (SELECT ok FROM valid) AS polygons_unchanged,
        count(*)::int AS changed_count FROM changed`,
    [JSON.stringify(expectedHamlets), JSON.stringify(assignments), actor, hamlets.length, unassigned]);
    if (!stored?.polygons_unchanged) throw new Error('Et grendepolygon ble endret under oppslaget; ingen koblinger ble lagret');
    if (stored.changed_count !== pending.length) {
      throw new Error(`Forventet å lagre ${pending.length}, men lagret ${stored.changed_count}. Kontroller samtidige endringer.`);
    }
    const [verified] = await sql`
      SELECT count(*) FILTER (WHERE deleted_at IS NULL AND hamlet_id IS NOT NULL)::int AS linked,
        count(*) FILTER (WHERE deleted_at IS NULL AND hamlet_id IS NULL)::int AS unlinked
      FROM members
    `;
    console.log(JSON.stringify({ storedAssignments: stored.changed_count, verified }, null, 2));
  }
} catch (error) {
  console.error('Grendekoblingen mislyktes.', { code: error.code || error.cause?.code, message: error.message });
  process.exitCode = 1;
}
