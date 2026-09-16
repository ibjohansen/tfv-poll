import { clipRoad, MapError, validatePolygon } from './geo.js';
import { nullableText } from './normalization.js';
import { fetchMapJson } from './http.js';

export async function findRoadsInPolygon(input, options = {}) {
  const t = options.t || ((key) => key);
  const { polygon, bbox: [west, south, east, north] } = validatePolygon(input);
  // Small margin reduces missed ways whose nearest vertex is just outside the
  // search bbox. Overpass selects ways by nodes, not exact line intersection.
  const margin = 0.002;
  const bounds = [south - margin, west - margin, north + margin, east + margin].join(',');
  const query = `[out:json][timeout:15][maxsize:16777216];way["highway"](${bounds});out tags geom;`;
  const data = await fetchMapJson('https://overpass-api.de/api/interpreter', {
    ...options, signal: options.signal || AbortSignal.timeout(25_000), source: 'OpenStreetMap/Overpass', method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: query }).toString(),
  });
  if (!Array.isArray(data?.elements) || data.remark) throw new MapError('errors.incompleteOverpass', 502);
  const groups = new Map();
  let vertices = 0;
  for (const way of data.elements) {
    if (way.type !== 'way' || !Number.isSafeInteger(way.id) || !Array.isArray(way.geometry) || way.geometry.length < 2) {
      throw new MapError('errors.invalidRoadGeometry', 502);
    }
    vertices += way.geometry.length;
    if (vertices > 30_000) throw new MapError('errors.tooManyRoadSegments', 413);
    const coordinates = way.geometry.map((p) => [p.lon, p.lat]);
    if (coordinates.some((p) => !p.every(Number.isFinite) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) throw new MapError('errors.invalidRoadCoordinates', 502);
    const clipped = clipRoad(coordinates, polygon);
    if (!clipped.geometry) continue;
    const tags = way.tags || {};
    const properties = { name: nullableText(tags.name), roadType: nullableText(tags.highway), reference: nullableText(tags.ref),
      surface: nullableText(tags.surface), access: nullableText(tags.access), source: 'OpenStreetMap', license: 'ODbL 1.0', kind: 'road' };
    const key = JSON.stringify([properties.name || way.id, properties.roadType, properties.reference, properties.surface, properties.access]);
    if (!groups.has(key)) groups.set(key, { ...properties, id: `osm:${way.id}`, osmIds: [], lengthMeters: 0, geometry: { type: 'MultiLineString', coordinates: [] } });
    const group = groups.get(key);
    group.osmIds.push(way.id); group.lengthMeters += clipped.lengthMeters;
    group.geometry.coordinates.push(...clipped.geometry.coordinates);
  }
  return { roads: [...groups.values()].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'nb-NO', { numeric: true })),
    source: 'OpenStreetMap', fetchedAt: new Date().toISOString(),
    warnings: [t('warnings.roads')] };
}
