import { getSql } from '../db.js';
import { lookupAddress } from '../matrikkel-client.js';
import { compareRegisterWithMapData } from './comparison.js';
import { findAddressesInPolygon } from './kartverket-address-service.js';
import { addressPointCoordinates, expectedHamletProperty, hamletsContainingPoint } from './hamlet-assignment-utils.js';
import { cadastralInteger, normalizeCadastral, nullableText } from './normalization.js';

const ACTOR = 'system:hamlet-member-sync';
const MAX_HAMLETS = 200;
const MAX_MEMBERS = 5_000;
const MAX_FALLBACK_LOOKUPS = 400;

function registerProperty(row) {
  const cadastral = normalizeCadastral(row.cadastral_number || '');
  return {
    id: String(row.id), address: nullableText(row.street_address), hNumber: nullableText(row.h_number),
    ...cadastral, snr: cadastralInteger(row.section_number) ?? cadastral.snr,
    municipalityNumber: '3320', source: 'Turufjell vel', owners: [],
  };
}

async function mapWithConcurrency(values, concurrency, callback) {
  const results = new Array(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next++;
      results[index] = await callback(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

function idsForExactMatches(comparison) {
  return [...new Set(comparison.rows
    .filter((row) => row.status === 'MATCH' && row.scope === 'address_in_polygon' && row.register?.id)
    .map((row) => String(row.register.id)))];
}

async function locatePreviouslyLinkedMember(member, hamlets, lookup, signal) {
  const address = nullableText(member.street_address);
  if (!address) return { status: 'unresolved' };
  try {
    const lookupSignal = AbortSignal.any([signal, AbortSignal.timeout(12_000)]);
    const result = await lookup(address, expectedHamletProperty(member.cadastral_number, member.section_number), { signal: lookupSignal });
    if (!['EXACT', 'EXACT_PROPERTY'].includes(result.matchType)) return { status: 'unresolved' };
    const coordinates = addressPointCoordinates(result.candidate);
    if (!coordinates) return { status: 'unresolved' };
    const matches = hamletsContainingPoint(hamlets, coordinates);
    if (matches.length > 1) return { status: 'ambiguous' };
    return { status: 'located', hamletId: matches[0] ? String(matches[0].id) : null };
  } catch {
    return { status: 'unresolved' };
  }
}

function changeType(previousHamletId, hamletId) {
  if (!previousHamletId && hamletId) return 'assigned';
  if (previousHamletId && !hamletId) return 'unassigned';
  return 'moved';
}

export async function synchronizeMemberHamlets({
  sql = getSql(), findAddresses = findAddressesInPolygon, lookup = lookupAddress,
  signal = AbortSignal.timeout(12 * 60 * 1_000), trigger = null,
} = {}) {
  const hamlets = await sql.query(`SELECT id, name, polygon, polygon_version
    FROM member_hamlets
    WHERE deleted_at IS NULL AND polygon IS NOT NULL AND polygon_reviewed = TRUE
    ORDER BY id`);
  const members = await sql.query(`SELECT id, h_number, cadastral_number, section_number, street_address, hamlet_id
    FROM members WHERE deleted_at IS NULL ORDER BY id`);
  if (!hamlets.length || hamlets.length > MAX_HAMLETS || members.length > MAX_MEMBERS) {
    throw new Error('Unexpected data volume for hamlet synchronization');
  }

  const register = members.map(registerProperty);
  const perHamlet = await mapWithConcurrency(hamlets, 3, async (hamlet) => {
    const official = await findAddresses(hamlet.polygon, { signal });
    if (!official.complete) throw new Error(`Incomplete address data for hamlet ${hamlet.id}`);
    const comparison = compareRegisterWithMapData(register, official.addresses, { polygon: hamlet.polygon });
    return {
      id: String(hamlet.id), version: Number(hamlet.polygon_version),
      officialAddressCount: comparison.officialCount, memberIds: idsForExactMatches(comparison),
    };
  });

  const candidates = new Map();
  for (const result of perHamlet) for (const memberId of result.memberIds) {
    candidates.set(memberId, [...(candidates.get(memberId) || []), result.id]);
  }

  const desired = new Map();
  const fallbackMembers = [];
  let ambiguousCount = 0;
  let unresolvedCount = 0;
  for (const member of members) {
    const memberId = String(member.id);
    const matches = [...new Set(candidates.get(memberId) || [])];
    if (matches.length === 1) {
      desired.set(memberId, matches[0]);
      continue;
    }
    if (matches.length > 1) {
      ambiguousCount += 1;
      continue;
    }
    // Existing links may have become stale after a polygon edit. Only remove
    // or move one when an exact official address point proves the new result.
    if (member.hamlet_id !== null && member.hamlet_id !== undefined) {
      fallbackMembers.push(member);
    } else {
      unresolvedCount += 1;
    }
  }
  const lookupMembers = fallbackMembers.slice(0, MAX_FALLBACK_LOOKUPS);
  unresolvedCount += fallbackMembers.length - lookupMembers.length;
  const locations = await mapWithConcurrency(lookupMembers, 8,
    (member) => locatePreviouslyLinkedMember(member, hamlets, lookup, signal));
  locations.forEach((located, index) => {
    if (located.status === 'located') desired.set(String(lookupMembers[index].id), located.hamletId);
    else if (located.status === 'ambiguous') ambiguousCount += 1;
    else unresolvedCount += 1;
  });

  const changes = [];
  const counts = { assigned: 0, moved: 0, unassigned: 0 };
  for (const member of members) {
    const memberId = String(member.id);
    if (!desired.has(memberId)) continue;
    const previousHamletId = member.hamlet_id === null || member.hamlet_id === undefined ? null : String(member.hamlet_id);
    const hamletId = desired.get(memberId);
    if (previousHamletId === hamletId) continue;
    const type = changeType(previousHamletId, hamletId);
    counts[type] += 1;
    changes.push({ member_id: memberId, previous_hamlet_id: previousHamletId, hamlet_id: hamletId });
  }

  const expectedHamlets = perHamlet.map(({ id, version }) => ({ id, version }));
  const metadata = {
    action: 'hamlet_members_sync', changed_count: changes.length, linked_count: counts.assigned,
    moved_count: counts.moved, unlinked_count: counts.unassigned, hamlet_count: hamlets.length,
    active_member_count: members.length, ambiguous_count: ambiguousCount, unresolved_count: unresolvedCount,
    official_address_count: perHamlet.reduce((sum, result) => sum + result.officialAddressCount, 0),
    trigger_hamlet_id: trigger?.hamletId || null, trigger_polygon_version: trigger?.polygonVersion || null,
  };
  const [stored] = await sql.query(`WITH expected AS (
      SELECT id, version FROM jsonb_to_recordset($1::jsonb) AS value(id bigint, version integer)
    ), requested AS (
      SELECT member_id, previous_hamlet_id, hamlet_id
      FROM jsonb_to_recordset($2::jsonb) AS value(member_id bigint, previous_hamlet_id bigint, hamlet_id bigint)
    ), valid AS (
      SELECT NOT EXISTS (
        SELECT 1 FROM expected e LEFT JOIN member_hamlets h ON h.id = e.id
        WHERE h.id IS NULL OR h.deleted_at IS NOT NULL OR h.polygon_reviewed IS NOT TRUE
          OR h.polygon IS NULL OR h.polygon_version <> e.version
      ) AND (SELECT count(*) FROM expected) = (SELECT count(*) FROM member_hamlets
        WHERE deleted_at IS NULL AND polygon IS NOT NULL AND polygon_reviewed = TRUE) AS ok
    ), changed AS (
      UPDATE members m SET hamlet_id = requested.hamlet_id, last_changed_by = $3
      FROM requested, valid
      WHERE valid.ok AND m.id = requested.member_id AND m.deleted_at IS NULL
        AND m.hamlet_id IS NOT DISTINCT FROM requested.previous_hamlet_id
      RETURNING m.id
    ), audited AS (
      INSERT INTO audit_log (table_name, row_id, operation, changed_by, after_value)
      SELECT 'admin_actions', $5, 'INSERT', $3, $4::jsonb || jsonb_build_object('stored_count', totals.changed_count)
      FROM valid CROSS JOIN (SELECT count(*)::int AS changed_count FROM changed) totals
      WHERE valid.ok
      RETURNING id
    )
    SELECT (SELECT ok FROM valid) AS polygons_unchanged, count(*)::int AS changed_count FROM changed`, [
    JSON.stringify(expectedHamlets), JSON.stringify(changes), ACTOR, JSON.stringify(metadata),
    `hamlet-member-sync:${trigger?.hamletId || 'all'}:${trigger?.polygonVersion || 'manual'}`,
  ]);
  if (!stored?.polygons_unchanged) throw new Error('Hamlet polygon changed during synchronization');
  if (Number(stored.changed_count) !== changes.length) throw new Error('Member assignment changed during synchronization');

  return {
    hamletCount: hamlets.length, activeMemberCount: members.length, changedCount: changes.length,
    assignedCount: counts.assigned, movedCount: counts.moved, unassignedCount: counts.unassigned,
    ambiguousCount, unresolvedCount,
    officialAddressCount: perHamlet.reduce((sum, result) => sum + result.officialAddressCount, 0),
  };
}
