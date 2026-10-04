import { MapError } from '../map/errors.js';
import { fetchMapJson } from '../map/http.js';
import { ACTIVITY_IMPORT_BBOX, ACTIVITY_IMPORT_MAX_COORDINATES, normalizeSourceText, sha256 } from './geometry.js';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const MAX_OSM_ELEMENTS = 5_000;

function validElementId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function coordinatesFromGeometry(geometry) {
  if (!Array.isArray(geometry) || geometry.length < 2) return null;
  const coordinates = geometry.map((point) => [point?.lon, point?.lat]);
  return coordinates.every((point) => point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90)
    ? coordinates : null;
}

function appendConnected(lines, coordinates) {
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (same(line.at(-1), coordinates[0])) { line.push(...coordinates.slice(1)); return; }
    if (same(line.at(-1), coordinates.at(-1))) { line.push(...coordinates.slice(0, -1).reverse()); return; }
    if (same(line[0], coordinates.at(-1))) { line.unshift(...coordinates.slice(0, -1)); return; }
    if (same(line[0], coordinates[0])) { line.unshift(...coordinates.slice(1).reverse()); return; }
  }
  lines.push([...coordinates]);
}

function sourceProperties(element, fallbackName) {
  const tags = element.tags && typeof element.tags === 'object' ? element.tags : {};
  const operator = normalizeSourceText(tags.operator || tags.maintainer, 160);
  const description = normalizeSourceText(tags.description, 300);
  let websiteUrl = null;
  try {
    const candidate = new URL(String(tags.website || tags.url || '').trim());
    if (['https:', 'http:'].includes(candidate.protocol) && !candidate.username && !candidate.password && candidate.href.length <= 2048) websiteUrl = candidate.href;
  } catch { websiteUrl = null; }
  return {
    name: normalizeSourceText(tags.name || tags.ref, 160) || fallbackName,
    tooltipText: description || operator,
    operator,
    websiteUrl,
  };
}

export function parseOsmNordicRoutes(data) {
  if (!Array.isArray(data?.elements) || data.remark || data.elements.length > MAX_OSM_ELEMENTS) {
    throw new MapError('errors.activityImportOsmIncomplete', 502);
  }
  const memberWayIds = new Set();
  const lines = [];
  let coordinateCount = 0;
  for (const relation of data.elements.filter((element) => element.type === 'relation')) {
    if (!validElementId(relation.id) || !Array.isArray(relation.members)) throw new MapError('errors.activityImportSourceData', 502);
    const relationLines = [];
    for (const member of relation.members) {
      if (member.type === 'way' && validElementId(member.ref)) memberWayIds.add(member.ref);
      const coordinates = coordinatesFromGeometry(member.geometry);
      if (!coordinates) continue;
      coordinateCount += coordinates.length;
      appendConnected(relationLines, coordinates);
    }
    const properties = sourceProperties(relation, `OSM ${relation.id}`);
    relationLines.forEach((coordinates, index) => lines.push({
      sourceId: 'openstreetmap', externalId: `relation:${relation.id}${relationLines.length > 1 ? `:${index + 1}` : ''}`,
      sourceUrl: `https://www.openstreetmap.org/relation/${relation.id}`, coordinates, ...properties,
    }));
  }
  for (const way of data.elements.filter((element) => element.type === 'way' && !memberWayIds.has(element.id))) {
    if (!validElementId(way.id)) throw new MapError('errors.activityImportSourceData', 502);
    const coordinates = coordinatesFromGeometry(way.geometry);
    if (!coordinates) throw new MapError('errors.activityImportSourceData', 502);
    coordinateCount += coordinates.length;
    lines.push({ sourceId: 'openstreetmap', externalId: `way:${way.id}`, sourceUrl: `https://www.openstreetmap.org/way/${way.id}`,
      coordinates, ...sourceProperties(way, `OSM ${way.id}`) });
  }
  if (coordinateCount > ACTIVITY_IMPORT_MAX_COORDINATES) throw new MapError('errors.activityImportTooLarge', 413);
  return lines;
}

export async function fetchOsmNordicRoutes({ fetchImpl = fetch, signal } = {}) {
  const [west, south, east, north] = ACTIVITY_IMPORT_BBOX;
  const bounds = [south, west, north, east].join(',');
  const query = `[out:json][timeout:40][maxsize:33554432];(
    way["piste:type"="nordic"](${bounds});
    relation["piste:type"="nordic"](${bounds});
    relation["route"="piste"]["piste:type"="nordic"](${bounds});
  );out body geom;`;
  const data = await fetchMapJson(OVERPASS_URL, {
    fetchImpl, signal, source: 'OpenStreetMap/Overpass', method: 'POST', maxBytes: 32_000_000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: query }).toString(),
  });
  return { sourceId: 'openstreetmap', lines: parseOsmNordicRoutes(data), rawSha256: sha256(data), fetchedAt: new Date().toISOString() };
}
