import 'server-only';
import { isMockMode } from '../mock-store.js';
import { createMapCache } from './cache.js';
import { MapError, validatePolygon } from './geo.js';
import { findAddressesInPolygon } from './kartverket-address-service.js';
import { findRoadsInPolygon } from './osm-road-service.js';
import { propertiesFromAddresses } from './kartverket-property-service.js';
import { findPropertiesInPolygon } from './kartverket-boundary-service.js';
import { getRegisterProperties } from './register-service.js';
import { compareRegisterWithMapData } from './comparison.js';

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
