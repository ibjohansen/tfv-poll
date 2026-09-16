import { MapError, validatePolygon } from './geo.js';

export const HAMLET_SOURCE = 'Turufjell vel · manuelt tegnet grendegrense';

export function normalizeHamletInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || !['create', 'save', 'clear'].includes(input.action)) throw new MapError('errors.invalidHamletAction');
  const { action } = input;
  const id = action === 'create' ? null : String(input.id);
  if (id !== null && !/^[1-9][0-9]{0,15}$/.test(id)) throw new MapError('errors.invalidHamlet');
  const version = action === 'create' ? null : input.version;
  if (action !== 'create' && (!Number.isInteger(version) || version < 1 || version >= 2147483647)) {
    throw new MapError('errors.reloadHamlet');
  }
  if (action === 'clear') return { action, id, version, name: null, geometry: null, reviewed: false, areaM2: null, vertices: 0 };
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 100 || /[\x00-\x1f\x7f]/.test(input.name)) {
    throw new MapError('errors.hamletName');
  }
  if (input.reviewed !== undefined && typeof input.reviewed !== 'boolean') throw new MapError('errors.invalidReviewStatus');
  const { polygon, areaM2 } = validatePolygon(input.polygon);
  return { action, id, version, name: input.name.trim(), geometry: polygon.geometry,
    reviewed: input.reviewed === true, areaM2: Math.round(areaM2), vertices: polygon.geometry.coordinates[0].length - 1 };
}

export function hamletRecord(row) {
  const info = row.polygon ? validatePolygon(row.polygon) : null;
  return { id: String(row.id), name: row.name, version: row.polygon_version,
    reviewed: row.polygon_reviewed, updatedAt: row.polygon_updated_at, source: HAMLET_SOURCE,
    areaM2: info ? Math.round(info.areaM2) : null,
    polygon: info ? { type: 'Feature', properties: { kind: 'hamlet', name: row.name,
      source: HAMLET_SOURCE, reviewed: row.polygon_reviewed }, geometry: info.polygon.geometry } : null };
}
