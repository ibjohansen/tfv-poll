import { area, bbox, booleanPointInPolygon, booleanValid, distance, kinks, lineIntersect, lineString } from '@turf/turf';

export const TURUFJELL_CENTER = [9.4952, 60.4652];
export const MAX_VERTICES = 200;
export const MAX_AREA_M2 = 25_000_000;

export class MapError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'MapError';
    this.status = status;
  }
}

export function validatePolygon(input) {
  const geometry = input?.type === 'Feature' ? input.geometry : input;
  if (geometry?.type !== 'Polygon' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length !== 1) {
    throw new MapError('Velg ett polygon uten hull.');
  }
  const ring = geometry.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > MAX_VERTICES + 1) {
    throw new MapError(`Polygonet må ha mellom 3 og ${MAX_VERTICES} hjørner.`);
  }
  if (ring.some((p) => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)
    || p[0] < -180 || p[0] > 180 || p[1] < -90 || p[1] > 90)) {
    throw new MapError('Polygonet må ha gyldige lengde-/breddegrader (GeoJSON, EPSG:4326).');
  }
  if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) throw new MapError('Polygonet må være lukket.');
  if (new Set(ring.slice(0, -1).map((p) => p.join(','))).size !== ring.length - 1) throw new MapError('Polygonet har gjentatte hjørner.');
  // Discard caller-supplied properties and bbox, including stale/malicious bbox.
  const polygon = { type: 'Feature', properties: { source: 'Turufjell vel', kind: 'search_polygon' }, geometry: { type: 'Polygon', coordinates: [ring.map((p) => [...p])] } };
  if (!booleanValid(polygon) || kinks(polygon).features.length) throw new MapError('Polygonet krysser seg selv eller er ugyldig.');
  const areaM2 = area(polygon);
  if (areaM2 < 1 || areaM2 > MAX_AREA_M2) throw new MapError('Velg et område mellom 1 m² og 25 km².');
  if (ring.some((p) => distance(TURUFJELL_CENTER, p, { units: 'kilometers' }) > 20)) {
    throw new MapError('Velg et område i nærheten av Turufjell (maksimalt 20 km fra startpunktet).');
  }
  const bounds = bbox(polygon);
  const center = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
  const radius = Math.ceil(Math.max(...[[bounds[0], bounds[1]], [bounds[0], bounds[3]], [bounds[2], bounds[1]], [bounds[2], bounds[3]]]
    .map((p) => distance(center, p, { units: 'meters' })))) + 2;
  if (radius > 5_000) throw new MapError('Området er for langstrakt. Velg et mindre utsnitt (søkeradius maks. 5 km).');
  return { polygon, bbox: bounds, center, radius, areaM2, areaKm2: areaM2 / 1_000_000 };
}

export function containsPoint(polygon, coordinates) {
  return Array.isArray(coordinates) && coordinates.length === 2 && coordinates.every(Number.isFinite)
    && booleanPointInPolygon(coordinates, polygon);
}

// Split each segment at polygon edges, then retain only inside pieces. This
// also handles concave polygons, crossing ways with outside endpoints and
// segments exactly on the boundary; length is measured only after clipping.
export function clipRoad(coordinates, polygon) {
  const pieces = [];
  let lengthMeters = 0;
  for (let i = 1; i < coordinates.length; i += 1) {
    const a = coordinates[i - 1];
    const b = coordinates[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    if (!dx && !dy) continue;
    const segment = lineString([a, b]);
    const hits = lineIntersect(segment, polygon).features.map((f) => f.geometry.coordinates);
    // Collinear boundary vertices are not always returned by lineIntersect.
    for (const p of polygon.geometry.coordinates[0]) {
      if (Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) < 1e-12) hits.push(p);
    }
    const tFor = (p) => Math.abs(dx) >= Math.abs(dy) ? (p[0] - a[0]) / dx : (p[1] - a[1]) / dy;
    const ts = [...new Set([0, 1, ...hits.map(tFor).filter((t) => t > 0 && t < 1)])].sort((x, y) => x - y);
    const at = (t) => [a[0] + t * dx, a[1] + t * dy];
    for (let j = 1; j < ts.length; j += 1) {
      if (!containsPoint(polygon, at((ts[j - 1] + ts[j]) / 2))) continue;
      const piece = [at(ts[j - 1]), at(ts[j])];
      const meters = distance(...piece, { units: 'meters' });
      if (meters < 0.001) continue;
      pieces.push(piece);
      lengthMeters += meters;
    }
  }
  return { geometry: pieces.length ? { type: 'MultiLineString', coordinates: pieces } : null, lengthMeters };
}
