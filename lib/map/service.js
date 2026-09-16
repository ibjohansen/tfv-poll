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

async function officialData(datatype, polygon, signal, t, locale = 'nb') {
  const key = `v1:${locale}:${datatype}:${JSON.stringify(polygon.geometry.coordinates)}`;
  return cached(key, () => providers[datatype](polygon, { signal, t }));
}

export async function searchMapData(input, { signal, locale, t } = {}) {
  if (!['addresses', 'roads', 'properties', 'comparison'].includes(input.datatype)) throw new MapError('errors.invalidDatatype');
  if (input.includeBoundaries !== undefined && typeof input.includeBoundaries !== 'boolean') throw new MapError('errors.invalidBoundaries');
  const hamletId = input.hamletId === undefined || input.hamletId === null ? null : String(input.hamletId);
  if (hamletId !== null && (input.datatype !== 'comparison' || !/^[1-9][0-9]{0,15}$/.test(hamletId))) {
    throw new MapError('errors.invalidComparisonHamlet');
  }
  const search = validatePolygon(input.polygon);
  if (['roads', 'properties'].includes(input.datatype)) return { ...search, ...await officialData(input.datatype, search.polygon, signal, t, locale) };
  const result = await officialData('addresses', search.polygon, signal, t, locale);
  if (input.datatype === 'comparison') {
    if (!result.complete) throw new MapError('errors.incompleteAddresses', 409);
    const register = await getRegisterProperties({ hamletId });
    const boundaryData = input.includeBoundaries ? await officialData('properties', search.polygon, signal, t, locale) : { boundaries: [] };
    return { ...search, ...result, comparison: {
      ...compareRegisterWithMapData(register, result.addresses, { polygon: search.polygon, boundaries: boundaryData.boundaries, t }),
      registerScope: hamletId === null ? 'all' : 'hamlet',
    }, mockRegister: isMockMode() };
  }
  return { ...search, ...result, properties: propertiesFromAddresses(result.addresses) };
}
