import { containsPoint, MapError, validatePolygon } from './geo.js';
import { cadastralInteger, nullableText, sortAddresses } from './normalization.js';
import { fetchMapJson } from './http.js';

const ENDPOINT = 'https://ws.geonorge.no/adresser/v1/punktsok';
const PAGE_SIZE = 1000;
const MAX_RESULTS = 10_000;

export function normalizeKartverketAddress(row) {
  if (!row || typeof row !== 'object') throw new MapError('errors.invalidAddressObject', 502);
  const point = row.representasjonspunkt;
  if (point && (point.epsg !== 'EPSG:4326' || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)
    || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180)) throw new MapError('errors.invalidAddressCoordinates', 502);
  const address = {
    address: nullableText(row.adressetekstutenadressetilleggsnavn) || nullableText(row.adressetekst),
    addressName: nullableText(row.adressenavn), houseNumber: cadastralInteger(row.nummer), houseLetter: nullableText(row.bokstav),
    postalCode: nullableText(row.postnummer), postalPlace: nullableText(row.poststed),
    municipalityNumber: nullableText(row.kommunenummer), municipalityName: nullableText(row.kommunenavn),
    latitude: point?.lat ?? null, longitude: point?.lon ?? null,
    gnr: cadastralInteger(row.gardsnummer), bnr: cadastralInteger(row.bruksnummer), fnr: cadastralInteger(row.festenummer),
    // The address API explicitly does NOT provide a section association.
    snr: null, source: 'Kartverket', license: 'CC BY 4.0', kind: 'address',
  };
  // No stable object ID is provided by this API. Use a deterministic composite,
  // keeping different parcels/coordinates at the same address distinct.
  address.id = `kartverket:${JSON.stringify([row.kommunenummer, row.adressekode, address.address, row.undernummer, address.gnr, address.bnr, address.fnr, address.longitude, address.latitude])}`;
  return { ...address, feature: point ? { type: 'Feature', id: address.id, properties: { ...address }, geometry: { type: 'Point', coordinates: [point.lon, point.lat] } } : null };
}

export async function findAddressesInPolygon(input, options = {}) {
  const t = options.t || ((key) => key);
  const { polygon, center, radius } = validatePolygon(input);
  const signal = options.signal || AbortSignal.timeout(25_000);
  const found = new Map();
  const seen = new Set();
  let expectedTotal = null;
  let received = 0;
  let unlocatedCount = 0;
  for (let page = 0; page < MAX_RESULTS / PAGE_SIZE; page += 1) {
    const params = new URLSearchParams({ lat: String(center[1]), lon: String(center[0]), radius: String(radius),
      koordsys: '4326', utkoordsys: '4326', treffPerSide: String(PAGE_SIZE), side: String(page), asciiKompatibel: 'false' });
    const data = await fetchMapJson(`${ENDPOINT}?${params}`, { ...options, signal, source: 'Kartverket' });
    const total = data?.metadata?.totaltAntallTreff;
    if (!Array.isArray(data?.adresser) || !Number.isSafeInteger(total) || total < 0 || data.metadata.side !== page
      || data.adresser.length > PAGE_SIZE || (expectedTotal !== null && total !== expectedTotal)) {
      throw new MapError('errors.incompleteKartverketResponse', 502);
    }
    if (total > MAX_RESULTS) throw new MapError('errors.tooManyAddresses', 413);
    expectedTotal = total;
    received += data.adresser.length;
    if (received > total) throw new MapError('errors.addressCountMismatch', 502);
    for (const row of data.adresser) {
      const address = normalizeKartverketAddress(row);
      if (seen.has(address.id)) throw new MapError('errors.duplicateAddresses', 502);
      seen.add(address.id);
      if (!address.feature) { unlocatedCount += 1; continue; }
      if (containsPoint(polygon, address.feature.geometry.coordinates)) found.set(address.id, address);
    }
    if (received >= total) return { addresses: sortAddresses([...found.values()]), complete: unlocatedCount === 0, unlocatedCount,
      source: 'Kartverket', fetchedAt: new Date().toISOString(), warnings: unlocatedCount ? [t('warnings.unlocatedAddresses', { count: unlocatedCount })] : [] };
    if (data.adresser.length !== PAGE_SIZE) throw new MapError('errors.missingAddresses', 502);
  }
  throw new MapError('errors.searchTooLarge', 413);
}
