import { bbox, circle, feature, length, lineString, pointToLineDistance, simplify } from '@turf/turf';
import { createHash } from 'node:crypto';
import { ACTIVITY_MAP_CENTER } from '../activity-map-display.js';
import { clipRoad } from '../map/geo.js';

export const ACTIVITY_IMPORT_RADIUS_KM = 20;
export const ACTIVITY_IMPORT_MAX_POINTS = 200;
export const ACTIVITY_IMPORT_MAX_CANDIDATES = 2_000;
export const ACTIVITY_IMPORT_MAX_COORDINATES = 80_000;
export const ACTIVITY_IMPORT_AREA = circle(ACTIVITY_MAP_CENTER, ACTIVITY_IMPORT_RADIUS_KM, { units: 'kilometers', steps: 128 });
export const ACTIVITY_IMPORT_BBOX = bbox(ACTIVITY_IMPORT_AREA);

const samePoint = (a, b) => Math.abs(a[0] - b[0]) < 1e-10 && Math.abs(a[1] - b[1]) < 1e-10;

export function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

export function normalizeSourceText(value, maxLength) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, maxLength) : null;
}

function validCoordinates(coordinates) {
  return Array.isArray(coordinates) && coordinates.length >= 2 && coordinates.every((coordinate) => Array.isArray(coordinate)
    && coordinate.length === 2 && coordinate.every(Number.isFinite) && Math.abs(coordinate[0]) <= 180 && Math.abs(coordinate[1]) <= 90);
}

function joinedPieces(coordinates) {
  const clipped = clipRoad(coordinates, ACTIVITY_IMPORT_AREA).geometry?.coordinates || [];
  const paths = [];
  for (const piece of clipped) {
    const current = paths.at(-1);
    if (current && samePoint(current.at(-1), piece[0])) current.push(piece[1]);
    else paths.push([piece[0], piece[1]]);
  }
  return paths.map((path) => path.filter((point, index) => index === 0 || !samePoint(point, path[index - 1])))
    .filter((path) => path.length >= 2 && length(lineString(path), { units: 'meters' }) >= 15);
}

function splitLine(coordinates) {
  let points = coordinates;
  if (points.length > ACTIVITY_IMPORT_MAX_POINTS) {
    points = simplify(lineString(points), { tolerance: 0.00002, highQuality: true }).geometry.coordinates;
  }
  if (points.length <= ACTIVITY_IMPORT_MAX_POINTS) return [points];
  const chunks = [];
  for (let start = 0; start < points.length - 1; start += ACTIVITY_IMPORT_MAX_POINTS - 1) {
    const chunk = points.slice(start, start + ACTIVITY_IMPORT_MAX_POINTS);
    if (chunk.length >= 2) chunks.push(chunk);
  }
  return chunks;
}

export function normalizeSourceLine(sourceLine) {
  if (!validCoordinates(sourceLine.coordinates)) return { candidates: [], rejection: 'invalid_geometry' };
  const paths = joinedPieces(sourceLine.coordinates).flatMap(splitLine);
  if (!paths.length) return { candidates: [], rejection: 'outside_area' };
  return { candidates: paths.map((coordinates, index) => ({
    ...sourceLine,
    externalId: paths.length === 1 ? sourceLine.externalId : `${sourceLine.externalId}:${index + 1}`,
    sourceExternalId: sourceLine.externalId,
    segmentIndex: index,
    sourceGeometry: { type: 'LineString', coordinates: sourceLine.coordinates },
    geometry: { type: 'LineString', coordinates },
  })), rejection: null };
}

function normalizedMatchText(value) {
  return String(value || '').normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('nb-NO')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function expandedBounds(geometry, meters = 25) {
  const bounds = bbox(feature(geometry));
  const latitude = (bounds[1] + bounds[3]) / 2;
  const latMargin = meters / 111_320;
  const lonMargin = meters / (111_320 * Math.max(Math.cos(latitude * Math.PI / 180), 0.2));
  return [bounds[0] - lonMargin, bounds[1] - latMargin, bounds[2] + lonMargin, bounds[3] + latMargin];
}

function boundsOverlap(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function nearFraction(from, to, toleranceMeters) {
  const target = lineString(to.coordinates);
  const points = from.coordinates;
  const step = Math.max(1, Math.ceil(points.length / 80));
  const sampled = points.filter((_point, index) => index % step === 0 || index === points.length - 1);
  const near = sampled.filter((coordinate) => pointToLineDistance(coordinate, target, { units: 'meters' }) <= toleranceMeters).length;
  return sampled.length ? near / sampled.length : 0;
}

export function lineOverlapScore(a, b, toleranceMeters = 25) {
  if (!boundsOverlap(expandedBounds(a, toleranceMeters), expandedBounds(b, toleranceMeters))) return 0;
  // Kildene deler ofte samme rute på ulike steder, og visningslinjer deles
  // dessuten ved 200 punkter. Mål derfor dekningen av den best avgrensede
  // delen, ikke krev at begge leverandørenes segmentgrenser er identiske.
  return Math.max(nearFraction(a, b, toleranceMeters), nearFraction(b, a, toleranceMeters));
}

export function candidatesMatch(a, b) {
  const nameA = normalizedMatchText(a.name);
  const nameB = normalizedMatchText(b.name);
  const operatorA = normalizedMatchText(a.operator);
  const operatorB = normalizedMatchText(b.operator);
  if ((!nameA || nameA !== nameB) && (!operatorA || operatorA !== operatorB)) return { matched: false, score: 0 };
  const score = lineOverlapScore(a.geometry, b.geometry);
  return { matched: score >= 0.8, score };
}

export function sourceCandidateFingerprint(candidate) {
  return sha256({ name: candidate.name, tooltipText: candidate.tooltipText || null, operator: candidate.operator || null,
    websiteUrl: candidate.websiteUrl || null, geometry: candidate.geometry });
}
