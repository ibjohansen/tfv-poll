import { XMLParser, XMLValidator } from 'fast-xml-parser';
import proj4 from 'proj4';
import { booleanIntersects, booleanValid } from '@turf/turf';
import { MapError, validatePolygon } from './geo.js';
import { readLimitedText } from './http.js';
import { cadastralInteger, nullableText, propertyLabel } from './normalization.js';

const ENDPOINT = 'https://wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig';
const CRS = 'urn:ogc:def:crs:EPSG::25832';
const UTM = '+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs';
export const MAX_BOUNDARIES = 2000;
const array = (value) => value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
const content = (value) => typeof value === 'object' && value ? value['#text'] : value;
const boolean = (value) => value === 'true' ? true : value === 'false' ? false : null;
const badData = () => new MapError('Kartverket ga eiendomsdata som ikke kunne kontrolleres. Prøv igjen eller velg et mindre område.', 502);
const incomplete = () => new MapError('Eiendomsuttrekket er ufullstendig eller ble endret under søket. Prøv igjen eller tegn et mindre område.', 409);

export function toUtm32(point) { return proj4('EPSG:4326', UTM, point); }
export function fromUtm32(point) { return proj4(UTM, 'EPSG:4326', point); }

export function boundaryBbox(bounds) {
  // Within the validated 5 km search radius: densify all geographic edges,
  // then add 2 m outward margin (also covers coordinate serialization).
  const points = [];
  for (let i = 0; i <= 32; i += 1) {
    const x = bounds[0] + (bounds[2] - bounds[0]) * i / 32;
    const y = bounds[1] + (bounds[3] - bounds[1]) * i / 32;
    points.push(toUtm32([x, bounds[1]]), toUtm32([x, bounds[3]]), toUtm32([bounds[0], y]), toUtm32([bounds[2], y]));
  }
  return [Math.floor(Math.min(...points.map((p) => p[0])) - 2), Math.floor(Math.min(...points.map((p) => p[1])) - 2),
    Math.ceil(Math.max(...points.map((p) => p[0])) + 2), Math.ceil(Math.max(...points.map((p) => p[1])) + 2)];
}

function collection(xml) {
  if (typeof xml !== 'string' || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw badData();
  const data = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, processEntities: false }).parse(xml);
  if (!data.FeatureCollection || data.ExceptionReport || data.FeatureCollection.featureMembers) throw badData();
  return data.FeatureCollection;
}

function geometryFromGml(area, budget) {
  function check(node) {
    if (!node || typeof node !== 'object') throw badData();
    if (node['@_srsName'] && node['@_srsName'] !== CRS) throw badData();
    if (node['@_srsDimension'] && String(node['@_srsDimension']) !== '2') throw badData();
    if (node['@_href']) throw badData(); // Never resolve links or fetch remote geometry.
  }
  function ring(value) {
    check(value); const linear = value.LinearRing; check(linear);
    const positions = array(linear.posList);
    if (positions.length !== 1 || linear.pos || linear.coordinates) throw badData();
    if (typeof positions[0] === 'object') check(positions[0]);
    const raw = content(positions[0]);
    if (typeof raw !== 'string' || !raw.trim()) throw badData();
    const numbers = raw.trim().split(/\s+/).map(Number);
    if (numbers.length < 8 || numbers.length % 2 || numbers.some((n) => !Number.isFinite(n))) throw badData();
    budget.vertices += numbers.length / 2;
    if (budget.vertices > 150_000) throw new MapError('Eiendomsgrensene er for detaljerte. Velg et mindre område.', 413);
    const coordinates = [];
    for (let i = 0; i < numbers.length; i += 2) {
      // Norway's UTM32 data may extend outside zone32, but never outside these broad bounds.
      if (numbers[i] < -100_000 || numbers[i] > 1_500_000 || numbers[i + 1] < 6_000_000 || numbers[i + 1] > 8_500_000) throw badData();
      const point = fromUtm32([numbers[i], numbers[i + 1]]);
      if (!point.every(Number.isFinite) || point[1] < 50 || point[1] > 85) throw badData();
      coordinates.push(point);
    }
    if (numbers[0] !== numbers.at(-2) || numbers[1] !== numbers.at(-1)) throw badData();
    return coordinates;
  }
  function polygon(value) {
    check(value);
    if (array(value.exterior).length !== 1) throw badData();
    return [ring(value.exterior), ...array(value.interior).map(ring)];
  }
  function surfaces(value) {
    check(value);
    const keys = Object.keys(value).filter((key) => !key.startsWith('@_'));
    if (keys.length !== 1) throw badData();
    if (value.Polygon) return array(value.Polygon).map(polygon);
    if (value.Surface) {
      check(value.Surface);
      const patches = value.Surface.patches;
      if (!patches?.PolygonPatch || Object.keys(patches).some((key) => !key.startsWith('@_') && key !== 'PolygonPatch')) throw badData();
      return array(patches.PolygonPatch).map(polygon);
    }
    if (value.MultiSurface) {
      check(value.MultiSurface);
      if (value.MultiSurface.surfaceMembers || !value.MultiSurface.surfaceMember) throw badData();
      return array(value.MultiSurface.surfaceMember).flatMap(surfaces);
    }
    throw badData();
  }
  const polygons = surfaces(area);
  const geometry = polygons.length === 1 ? { type: 'Polygon', coordinates: polygons[0] } : { type: 'MultiPolygon', coordinates: polygons };
  if (!polygons.length || !booleanValid({ type: 'Feature', properties: {}, geometry })) throw badData();
  return geometry;
}

export function parseBoundaryFeatures(xml) {
  const data = collection(xml);
  const members = array(data.member);
  if (members.length > MAX_BOUNDARIES) throw new MapError('For mange teiger. Tegn et mindre område (maksimalt 2000 teiger).', 413);
  const ids = new Set(); const budget = { vertices: 0 };
  return members.map((member) => {
    const teig = member.Teig;
    if (!teig || Array.isArray(teig) || Object.keys(member).some((key) => key !== 'Teig' && !key.startsWith('@_'))) throw badData();
    const id = nullableText(teig['@_id']);
    if (!id || ids.has(id)) throw incomplete();
    ids.add(id);
    const references = array(teig.matrikkelenhet).map((entry) => {
      const value = entry.Matrikkelenhet;
      if (!value || Array.isArray(value) || entry['@_href']) throw badData();
      return { municipalityNumber: nullableText(value.kommunenummer), gnr: cadastralInteger(value.gardsnummer),
        bnr: cadastralInteger(value.bruksnummer), fnr: cadastralInteger(value.festenummer), snr: cadastralInteger(value.seksjonsnummer),
        propertyType: nullableText(value.matrikkelenhetstype) };
    });
    const properties = { id, kind: 'boundary', name: references.map(propertyLabel).join(' | ') || 'Matrikkelnummer mangler',
      references, municipalityNumber: nullableText(teig.kommunenummer), municipalityName: nullableText(teig.kommunenavn),
      accuracy: nullableText(content(teig.noyaktighetsklasseTeig)), disputed: boolean(teig.tvist),
      multipleProperties: boolean(teig.teigMedFlereMatrikkelenheter),
      source: 'Kartverket / Geonorge', license: 'CC BY 4.0', sourceCrs: 'EPSG:25832' };
    return { ...properties, feature: { type: 'Feature', id, properties, geometry: geometryFromGml(teig.område, budget) } };
  });
}

export async function findPropertiesInPolygon(input, { fetchImpl = fetch, signal } = {}) {
  const search = validatePolygon(input);
  const bbox = boundaryBbox(search.bbox).join(',') + ',' + CRS;
  const deadline = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(22_000)]);
  async function request(resultType) {
    const url = new URL(ENDPOINT);
    url.search = new URLSearchParams({ service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: 'app:Teig',
      srsName: CRS, bbox, resultType, count: String(MAX_BOUNDARIES + 1) });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetchImpl(url, { signal: deadline, cache: 'no-store', redirect: 'error',
          headers: { Accept: 'application/gml+xml, application/xml, text/xml', 'User-Agent': 'TurufjellVel-MapExplorer/1.0 (+https://medlemsservice.turufjellvel.no)' } });
        if (!response.ok) {
          await response.body?.cancel();
          if (response.status === 429) throw new MapError('Kartverkets grensetjeneste er opptatt. Vent litt og prøv igjen.', 503);
          if (response.status >= 500 && attempt === 0) continue;
          throw badData();
        }
        return await readLimitedText(response, resultType === 'hits' ? 100_000 : 8_000_000);
      } catch (error) {
        if (error instanceof MapError) throw error;
        if (deadline.aborted) throw new MapError('Grensesøket tok for lang tid eller ble avbrutt. Velg et mindre område.', 504);
        if (attempt === 1) throw badData();
      }
    }
  }
  async function count() {
    const matched = collection(await request('hits'))['@_numberMatched'];
    if (!/^\d+$/.test(String(matched)) || !Number.isSafeInteger(Number(matched))) throw incomplete();
    if (Number(matched) > MAX_BOUNDARIES) throw new MapError('For mange teiger. Tegn et mindre område (maksimalt 2000 teiger).', 413);
    return Number(matched);
  }
  const before = await count();
  const all = parseBoundaryFeatures(await request('results'));
  // This provider returns numberMatched="unknown" and numberReturned="0"
  // even for populated result collections (verified 2026-09-15). Use hits and
  // actual unique members, never assume paging or trust that returned count.
  if (all.length !== before || await count() !== before) throw incomplete();
  let boundaries;
  try { boundaries = all.filter((item) => booleanIntersects(item.feature, search.polygon)); }
  catch { throw badData(); }
  return { boundaries, complete: true, fetchedAt: new Date().toISOString(), source: 'Kartverket / Geonorge',
    warnings: ['Teiger som berører polygonet vises med hele sin registrerte geometri, også uten adresse. Teiggrenser kan inneholde hjelpelinjer og er ikke grunnlag for grensepåvisning.',
      'Uttrekket gjelder registrerte teiger, ikke alle rettigheter eller matrikkelenheter uten kartgeometri. Kontroller nøyaktighet, tvist og alle matrikkelreferanser.'] };
}
