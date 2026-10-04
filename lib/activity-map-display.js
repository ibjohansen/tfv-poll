import { MapError } from './map/errors.js';

export const ACTIVITY_MAP_CENTER = [9.493626688578507, 60.472346404200735];
export const ALPINE_COLORS = Object.freeze(['blue', 'yellow', 'green', 'red', 'black']);
export const ACTIVITY_SEASONS = Object.freeze(['summer', 'winter', 'all_year']);

// Unclassified legacy activities remain visible until a season is assigned.
export function activityMatchesSeason(feature, season) {
  return season === 'all' || !feature.season || feature.season === 'all_year' || feature.season === season;
}

export function activityMatchesTurufjell(feature, { includeManual = false } = {}) {
  const name = String(feature?.name || '').toLocaleLowerCase('nb-NO');
  const tooltip = String(feature?.tooltipText || '').toLocaleLowerCase('nb-NO');
  const manuallyCreated = includeManual && !feature?.sources?.length;
  return manuallyCreated || name.includes('turufjell') || tooltip.includes('turufjell') || tooltip.includes('vassfarfjellet løypelag');
}

function smoothClosedRing(ring, passes = 2, cornerCut = 0.05) {
  if (!Array.isArray(ring) || ring.length < 4) return ring;
  const first = ring[0];
  const last = ring.at(-1);
  let points = first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : [...ring];
  if (points.length < 3) return ring;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = [];
    for (let index = 0; index < points.length; index += 1) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
      next.push(
        [start[0] * (1 - cornerCut) + end[0] * cornerCut, start[1] * (1 - cornerCut) + end[1] * cornerCut],
        [start[0] * cornerCut + end[0] * (1 - cornerCut), start[1] * cornerCut + end[1] * (1 - cornerCut)],
      );
    }
    points = next;
  }
  return [...points, [...points[0]]];
}

export function smoothActivityGeometry(geometry) {
  if (geometry?.type !== 'Polygon') return geometry;
  return { ...geometry, coordinates: geometry.coordinates.map((ring) => smoothClosedRing(ring)) };
}

export function normalizeActivityNumber(value, category) {
  if (value === null || value === undefined || value === '') return null;
  if (category !== 'alpine' || typeof value !== 'string') throw new MapError('errors.activityNumber');
  const number = value.trim().replace(/\s+/g, ' ');
  if (!number || number.length > 24 || !/^[\p{L}\p{N}][\p{L}\p{N} ./_-]*$/u.test(number)) {
    throw new MapError('errors.activityNumber');
  }
  return number;
}
