import 'server-only';
import { randomUUID } from 'node:crypto';
import { getSql } from '../db.js';
import { isMockMode } from '../mock-store.js';
import { createMapCache } from './cache.js';
import { MapError, validatePolygon } from './geo.js';
import { findAddressesInPolygon } from './kartverket-address-service.js';
import { findRoadsInPolygon } from './osm-road-service.js';
import { propertiesFromAddresses } from './kartverket-property-service.js';
import { findPropertiesInPolygon } from './kartverket-boundary-service.js';
import { getRegisterProperties } from './register-service.js';
import { compareRegisterWithMapData } from './comparison.js';
import { addressesCsv, comparisonCsv, mapGeoJson } from './export.js';

const cached = createMapCache();
const providers = { addresses: findAddressesInPolygon, roads: findRoadsInPolygon, properties: findPropertiesInPolygon };

async function officialData(datatype, polygon, signal) {
  const key = `v1:${datatype}:${JSON.stringify(polygon.geometry.coordinates)}`;
  return cached(key, () => providers[datatype](polygon, { signal }));
}

export async function searchMapData(input, { signal } = {}) {
  if (!['addresses', 'roads', 'properties', 'comparison'].includes(input.datatype)) throw new MapError('Velg adresser, eiendomsgrenser, veier eller registersammenligning.');
  if (input.includeBoundaries !== undefined && typeof input.includeBoundaries !== 'boolean') throw new MapError('Ugyldig valg av eiendomsgrenser.');
  const search = validatePolygon(input.polygon);
  if (['roads', 'properties'].includes(input.datatype)) return { ...search, ...await officialData(input.datatype, search.polygon, signal) };
  const result = await officialData('addresses', search.polygon, signal);
  if (input.datatype === 'comparison') {
    if (!result.complete) throw new MapError('Adressegrunnlaget er ufullstendig. Hent et komplett søk før sammenligning.', 409);
    const register = await getRegisterProperties();
    const boundaryData = input.includeBoundaries ? await officialData('properties', search.polygon, signal) : { boundaries: [] };
    return { ...search, ...result, comparison: compareRegisterWithMapData(register, result.addresses, { polygon: search.polygon, boundaries: boundaryData.boundaries }), mockRegister: isMockMode() };
  }
  return { ...search, ...result, properties: propertiesFromAddresses(result.addresses) };
}

export async function createMapExport(input, user, { signal } = {}) {
  if (!['addresses-csv', 'comparison-csv', 'geojson'].includes(input.format)) throw new MapError('Ugyldig eksportformat.');
  if (input.includeRoads !== undefined && typeof input.includeRoads !== 'boolean') throw new MapError('Ugyldig valg av veilag.');
  if (input.includeBoundaries !== undefined && typeof input.includeBoundaries !== 'boolean') throw new MapError('Ugyldig valg av eiendomsgrenser.');
  const { polygon } = validatePolygon(input.polygon);
  const addressData = await officialData('addresses', polygon, signal);
  let body;
  let count;
  let extension = 'csv';
  let contentType = 'text/csv; charset=utf-8';
  if (input.format === 'comparison-csv') {
    if (!addressData.complete) throw new MapError('Adressegrunnlaget er ufullstendig. Sammenligningsrapport kan ikke lages.', 409);
    const register = await getRegisterProperties({ includeContacts: true });
    const boundaryData = input.includeBoundaries ? await officialData('properties', polygon, signal) : { boundaries: [] };
    const comparison = compareRegisterWithMapData(register, addressData.addresses, { polygon, boundaries: boundaryData.boundaries });
    body = comparisonCsv(comparison); count = comparison.rows.length + comparison.unlocatedRows.length;
  } else if (input.format === 'addresses-csv') {
    if (!addressData.complete) throw new MapError('Adressegrunnlaget er ufullstendig. Prøv søket igjen før eksport.', 409);
    body = addressesCsv(addressData.addresses); count = addressData.addresses.length;
  } else {
    if (!addressData.complete) throw new MapError('Adressegrunnlaget er ufullstendig. Prøv søket igjen før eksport.', 409);
    const roadData = input.includeRoads ? await officialData('roads', polygon, signal) : { roads: [] };
    const boundaryData = input.includeBoundaries ? await officialData('properties', polygon, signal) : { boundaries: [] };
    const collection = mapGeoJson(polygon, addressData.addresses, roadData.roads, boundaryData.boundaries);
    collection.properties = { addressFetchedAt: addressData.fetchedAt, roadFetchedAt: roadData.fetchedAt || null,
      attribution: '© Kartverket (CC BY 4.0); © OpenStreetMap contributors (ODbL 1.0)',
      boundaryFetchedAt: boundaryData.fetchedAt || null,
      note: 'Adresser er polygonfiltrert; veier er klippet. Valgte teiger som berører polygonet beholdes hele. Ingen interne medlemsdata er inkludert.' };
    body = JSON.stringify(collection, null, 2); count = collection.features.length;
    extension = 'geojson'; contentType = 'application/geo+json; charset=utf-8';
  }
  // Audit generated exports before delivery. Never include coordinates, register
  // values, names, email/telephone, search body or exported file contents.
  if (!isMockMode()) {
    const sql = getSql();
    await sql`
      INSERT INTO audit_log (table_name, row_id, operation, changed_by, after_value)
      VALUES ('admin_actions', ${randomUUID()}, 'INSERT', ${user.email.trim().toLowerCase()},
        ${JSON.stringify({ action: 'map_export', format: input.format, count, scope: 'polygon' })}::jsonb)
    `;
  }
  return { body, contentType, filename: `turufjell-${input.format}-${new Date().toISOString().slice(0, 10)}.${extension}` };
}
