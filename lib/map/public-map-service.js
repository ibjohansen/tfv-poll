import 'server-only';
import { getSql } from '../db.js';
import { isMockMode } from '../mock-store.js';
import { createMapCache } from './cache.js';
import { MapError } from './geo.js';
import { hamletRecord } from './hamlets.js';
import { findAddressesInPolygon } from './kartverket-address-service.js';
import { findPropertiesInPolygon } from './kartverket-boundary-service.js';
import { normalizeAddress, normalizeCadastral, propertyLabel } from './normalization.js';

const hamletFields = 'id, name, polygon, polygon_reviewed, polygon_version, polygon_updated_at';
const officialAddressCache = createMapCache({ ttlMs: 10 * 60_000, maxEntries: 12 });
const officialBoundaryCache = createMapCache({ ttlMs: 10 * 60_000, maxEntries: 12 });

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

function boundaryReferenceMatches(cadastral, reference) {
  const official = normalizeCadastral(reference);
  if (cadastral.gnr === null || cadastral.bnr === null
    || cadastral.gnr !== official.gnr || cadastral.bnr !== official.bnr) return false;
  return ['fnr', 'snr'].every((key) => cadastral[key] === null
    ? official[key] === null || official[key] === 0
    : cadastral[key] === official[key]);
}

export function propertyBoundaryGeometry(member, boundaries) {
  const cadastral = normalizeCadastral(member.cadastral_number || '');
  if (cadastral.gnr === null || cadastral.bnr === null) return null;
  const polygons = [];
  for (const boundary of boundaries) {
    if (!boundary.references?.some((reference) => boundaryReferenceMatches(cadastral, reference))) continue;
    const geometry = boundary.feature?.geometry;
    if (geometry?.type === 'Polygon') polygons.push(geometry.coordinates);
    else if (geometry?.type === 'MultiPolygon') polygons.push(...geometry.coordinates);
  }
  if (!polygons.length) return null;
  return polygons.length === 1
    ? { type: 'Polygon', coordinates: polygons[0] }
    : { type: 'MultiPolygon', coordinates: polygons };
}

export function normalizePublicProperties(rows, addresses, boundaries = []) {
  const byAddress = new Map();
  for (const address of addresses) {
    const key = normalizeAddress(address.address);
    if (key) byAddress.set(key, [...(byAddress.get(key) || []), address]);
  }
  const collator = new Intl.Collator('nb-NO', { numeric: true, sensitivity: 'base' });
  return rows.map((member) => {
    const official = officialMatch(member, byAddress);
    const boundary = propertyBoundaryGeometry(member, boundaries);
    const officialProperty = official ? propertyLabel(official) : null;
    const latitude = Number.isFinite(official?.latitude) ? official.latitude : null;
    const longitude = Number.isFinite(official?.longitude) ? official.longitude : null;
    return {
      hNumber: member.h_number || null,
      cadastralNumber: member.cadastral_number || (officialProperty === '–' ? null : officialProperty),
      address: member.street_address || official?.address || null,
      latitude,
      longitude,
      geometry: boundary || (latitude !== null && longitude !== null
        ? { type: 'Point', coordinates: [longitude, latitude] } : null),
      source: 'Turufjell vel',
      locationSource: boundary ? 'Kartverket / Geonorge' : official ? 'Kartverket' : null,
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

export async function getPublicHamletProperties(id, { signal, locale = 'nb', t } = {}) {
  if (!/^[1-9][0-9]{0,15}$/.test(String(id || ''))) throw new MapError('errors.invalidHamlet');
  if (isMockMode()) return { hamlet: null, properties: [], locatedCount: 0 };
  const sql = getSql();
  const [row] = await sql.query(`SELECT ${hamletFields} FROM member_hamlets
    WHERE id = $1 AND deleted_at IS NULL AND polygon_reviewed = TRUE AND polygon IS NOT NULL`, [String(id)]);
  if (!row) throw new MapError('errors.hamletMissing', 404);
  const hamlet = hamletRecord(row);
  const members = await sql`SELECT h_number, cadastral_number, street_address FROM members
    WHERE deleted_at IS NULL AND hamlet_id = ${String(id)}
    ORDER BY lower(COALESCE(street_address, '')), h_number, id`;
  if (!members.length) return { hamlet: { id: hamlet.id, name: hamlet.name }, properties: [], locatedCount: 0, fetchedAt: null };
  const cacheSuffix = `${locale}:${row.polygon_version}:${JSON.stringify(row.polygon)}`;
  const [official, boundaryData] = await Promise.all([
    officialAddressCache(`public-addresses:${cacheSuffix}`, () => findAddressesInPolygon(hamlet.polygon, { signal, t })),
    officialBoundaryCache(`public-boundaries:${cacheSuffix}`, () => findPropertiesInPolygon(hamlet.polygon, { signal, t }))
      .catch((error) => {
        if (signal?.aborted) throw error;
        return { boundaries: [], complete: false };
      }),
  ]);
  let properties = normalizePublicProperties(members, official.addresses, boundaryData.boundaries);
  if (JSON.stringify(properties).length > 1_500_000) properties = normalizePublicProperties(members, official.addresses);
  return {
    hamlet: { id: hamlet.id, name: hamlet.name },
    properties,
    locatedCount: properties.filter((property) => property.geometry).length,
    boundaryCount: properties.filter((property) => ['Polygon', 'MultiPolygon'].includes(property.geometry?.type)).length,
    fetchedAt: official.fetchedAt,
  };
}
