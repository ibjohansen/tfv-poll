import 'server-only';
import { lookupAddress } from '../matrikkel-client.js';
import { containsPoint, validatePolygon } from './geo.js';
import { normalizeCadastral } from './normalization.js';

function expectedProperty(cadastralNumber, sectionNumber) {
  const property = normalizeCadastral(cadastralNumber);
  const section = Number.parseInt(String(sectionNumber || ''), 10);
  if (Number.isSafeInteger(section) && section > 0) property.snr = section;
  return property.gnr !== null && property.bnr !== null ? property : null;
}

export function hamletContainingPoint(rows, coordinates) {
  const matches = rows.filter((row) => {
    try { return containsPoint(validatePolygon(row.polygon).polygon, coordinates); }
    catch { return false; }
  });
  return matches.length === 1 ? matches[0] : null;
}

export async function findHamletForNewMember(input, { sql, lookup = lookupAddress } = {}) {
  const address = String(input?.street_address || '').trim();
  if (!address) return { hamlet: null, status: 'address_missing' };
  const hamlets = await sql`
    SELECT id, name, polygon FROM member_hamlets
    WHERE deleted_at IS NULL AND polygon IS NOT NULL AND polygon_reviewed = TRUE
  `;
  if (!hamlets.length) return { hamlet: null, status: 'no_reviewed_hamlets' };
  try {
    const result = await lookup(address, expectedProperty(input.cadastral_number, input.section_number), {
      signal: AbortSignal.timeout(12_000),
    });
    if (!['EXACT', 'EXACT_PROPERTY'].includes(result.matchType)) return { hamlet: null, status: 'address_uncertain' };
    const point = result.candidate?.representasjonspunkt;
    const coordinates = [Number(point?.lon), Number(point?.lat)];
    if (!coordinates.every(Number.isFinite) || !['EPSG:4258', 'EPSG:4326'].includes(point?.epsg)) {
      return { hamlet: null, status: 'coordinates_missing' };
    }
    const hamlet = hamletContainingPoint(hamlets, coordinates);
    return { hamlet, status: hamlet ? 'linked' : 'outside_or_ambiguous' };
  } catch {
    // Opprettelsen skal fortsatt kunne gjennomføres dersom den åpne
    // adressetjenesten er utilgjengelig eller opplysningene ikke er entydige.
    return { hamlet: null, status: 'lookup_failed' };
  }
}
