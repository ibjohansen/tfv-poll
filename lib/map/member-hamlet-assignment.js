import 'server-only';
import { lookupAddress } from '../matrikkel-client.js';
import { addressPointCoordinates, expectedHamletProperty, hamletsContainingPoint } from './hamlet-assignment-utils.js';

export function hamletContainingPoint(rows, coordinates) {
  const matches = hamletsContainingPoint(rows, coordinates);
  return matches.length === 1 ? matches[0] : null;
}

export { addressPointCoordinates, expectedHamletProperty, hamletsContainingPoint };

export async function findHamletForNewMember(input, { sql, lookup = lookupAddress } = {}) {
  const address = String(input?.street_address || '').trim();
  if (!address) return { hamlet: null, status: 'address_missing' };
  const hamlets = await sql`
    SELECT id, name, polygon FROM member_hamlets
    WHERE deleted_at IS NULL AND polygon IS NOT NULL AND polygon_reviewed = TRUE
  `;
  if (!hamlets.length) return { hamlet: null, status: 'no_reviewed_hamlets' };
  try {
    const result = await lookup(address, expectedHamletProperty(input.cadastral_number, input.section_number), {
      signal: AbortSignal.timeout(12_000),
    });
    if (!['EXACT', 'EXACT_PROPERTY'].includes(result.matchType)) return { hamlet: null, status: 'address_uncertain' };
    const coordinates = addressPointCoordinates(result.candidate);
    if (!coordinates) return { hamlet: null, status: 'coordinates_missing' };
    const hamlet = hamletContainingPoint(hamlets, coordinates);
    return { hamlet, status: hamlet ? 'linked' : 'outside_or_ambiguous' };
  } catch {
    // Opprettelsen skal fortsatt kunne gjennomføres dersom den åpne
    // adressetjenesten er utilgjengelig eller opplysningene ikke er entydige.
    return { hamlet: null, status: 'lookup_failed' };
  }
}
