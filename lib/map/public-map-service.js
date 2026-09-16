import 'server-only';
import { getSql } from '../db.js';
import { isMockMode } from '../mock-store.js';
import { createMapCache } from './cache.js';
import { MapError } from './geo.js';
import { hamletRecord } from './hamlets.js';
import { findAddressesInPolygon } from './kartverket-address-service.js';
import { propertiesFromAddresses } from './kartverket-property-service.js';
import { normalizeAddress, normalizeCadastral } from './normalization.js';

const hamletFields = 'id, name, polygon, polygon_reviewed, polygon_version, polygon_updated_at';
const officialAddressCache = createMapCache({ ttlMs: 10 * 60_000, maxEntries: 12 });

function sameBase(left, right) {
  return left.gnr !== null && left.bnr !== null && left.gnr === right.gnr && left.bnr === right.bnr;
}

function officialMatch(member, byAddress) {
  const candidates = byAddress.get(normalizeAddress(member.street_address)) || [];
  if (candidates.length <= 1) return candidates[0] || null;
  const cadastral = normalizeCadastral(member.cadastral_number || '');
  const propertyMatches = candidates.filter((candidate) => sameBase(cadastral, normalizeCadastral(candidate)));
  return propertyMatches.length === 1 ? propertyMatches[0] : null;
}

export function normalizePublicProperties(rows, addresses) {
  const byAddress = new Map();
  for (const address of addresses) {
    const key = normalizeAddress(address.address);
    if (key) byAddress.set(key, [...(byAddress.get(key) || []), address]);
  }
  const collator = new Intl.Collator('nb-NO', { numeric: true, sensitivity: 'base' });
  const membersByOfficialAddress = new Map();
  const membersByCadastral = new Map();
  for (const member of rows) {
    const cadastral = normalizeCadastral(member.cadastral_number || '');
    if (cadastral.gnr !== null && cadastral.bnr !== null) {
      const key = `${cadastral.gnr}/${cadastral.bnr}`;
      membersByCadastral.set(key, [...(membersByCadastral.get(key) || []), member]);
    }
    const official = officialMatch(member, byAddress);
    if (!official) continue;
    membersByOfficialAddress.set(official.id, [...(membersByOfficialAddress.get(official.id) || []), member]);
  }
  return propertiesFromAddresses(addresses).map((officialProperty) => {
    const cadastralMatches = membersByCadastral.get(`${officialProperty.gnr}/${officialProperty.bnr}`) || [];
    const addressMatches = officialProperty.addresses.flatMap((address) => membersByOfficialAddress.get(address.id) || []);
    const matchedMembers = [...new Map((cadastralMatches.length ? cadastralMatches : addressMatches)
      .map((member) => [member.h_number, member])).values()];
    const addressLabels = [...new Set(officialProperty.addresses.map((address) => address.address).filter(Boolean))];
    const coordinates = officialProperty.geometry?.coordinates || [];
    return {
      hNumber: [...new Set(matchedMembers.map((member) => member.h_number).filter(Boolean))].join(', ') || null,
      cadastralNumber: officialProperty.label === '–' ? null : officialProperty.label,
      address: addressLabels.join(', ') || null,
      latitude: coordinates.length === 1 && Number.isFinite(coordinates[0]?.[1]) ? coordinates[0][1] : null,
      longitude: coordinates.length === 1 && Number.isFinite(coordinates[0]?.[0]) ? coordinates[0][0] : null,
      geometry: coordinates.length ? officialProperty.geometry : null,
      source: 'Kartverket',
      locationSource: 'Kartverket',
    };
  }).sort((left, right) => collator.compare(left.address || '', right.address || '')
    || collator.compare(left.hNumber || '', right.hNumber || ''))
    .map((property, index) => ({ ...property, id: `property-${index + 1}` }));
}

export async function getPublicMapHamlets() {
  if (isMockMode()) return [];
  const rows = await getSql().query(`SELECT ${hamletFields} FROM member_hamlets
    WHERE deleted_at IS NULL AND polygon_reviewed = TRUE AND polygon IS NOT NULL
    ORDER BY lower(name), id`);
  return rows.map(hamletRecord);
}

export async function getPublicHamletProperties(id, { signal } = {}) {
  if (!/^[1-9][0-9]{0,15}$/.test(String(id || ''))) throw new MapError('Velg en gyldig grend.');
  if (isMockMode()) return { hamlet: null, properties: [], locatedCount: 0 };
  const sql = getSql();
  const [row] = await sql.query(`SELECT ${hamletFields} FROM member_hamlets
    WHERE id = $1 AND deleted_at IS NULL AND polygon_reviewed = TRUE AND polygon IS NOT NULL`, [String(id)]);
  if (!row) throw new MapError('Grenden finnes ikke.', 404);
  const hamlet = hamletRecord(row);
  const members = await sql`SELECT h_number, cadastral_number, street_address FROM members
    WHERE deleted_at IS NULL
    ORDER BY lower(COALESCE(street_address, '')), h_number, id`;
  const official = await officialAddressCache(`public-addresses:${row.polygon_version}:${JSON.stringify(row.polygon)}`,
    () => findAddressesInPolygon(hamlet.polygon, { signal }));
  const properties = normalizePublicProperties(members, official.addresses);
  return {
    hamlet: { id: hamlet.id, name: hamlet.name },
    properties,
    locatedCount: properties.filter((property) => property.geometry).length,
    fetchedAt: official.fetchedAt,
  };
}
