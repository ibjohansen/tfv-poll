import { distance } from '@turf/turf';
import { MapError, validatePolygon } from './map/geo.js';

export const ACTIVITY_MAP_CENTER = [9.493626688578507, 60.472346404200735];
export const ACTIVITY_CATEGORIES = Object.freeze(['cycling', 'alpine']);
export const ACTIVITY_FEATURE_TYPES = Object.freeze(['trail', 'park', 'sledding', 'lift']);
export const ALPINE_COLORS = Object.freeze(['blue', 'yellow', 'green', 'red', 'black']);

export function activityGeometryKind(featureType) {
  return featureType === 'trail' || featureType === 'lift' ? 'polygon' : 'point';
}

function enumValue(value, allowed, code) {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new MapError(code);
  return value;
}

function normalizedName(value) {
  if (typeof value !== 'string' || value.length > 160) throw new MapError('errors.activityName');
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name) throw new MapError('errors.activityName');
  return name;
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

function normalizePoint(input) {
  const geometry = input?.type === 'Feature' ? input.geometry : input;
  const coordinates = geometry?.coordinates;
  if (geometry?.type !== 'Point' || !Array.isArray(coordinates) || coordinates.length !== 2
    || !coordinates.every(Number.isFinite) || coordinates[0] < -180 || coordinates[0] > 180
    || coordinates[1] < -90 || coordinates[1] > 90) throw new MapError('errors.activityPoint');
  if (distance(ACTIVITY_MAP_CENTER, coordinates, { units: 'kilometers' }) > 20) {
    throw new MapError('errors.polygonLocation');
  }
  return { type: 'Point', coordinates: [...coordinates] };
}

export function normalizeActivityFeatureInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new MapError('errors.invalidOptions');
  const action = enumValue(input.action, ['create', 'update', 'delete'], 'errors.activityAction');
  const id = action === 'create' ? null : String(input.id || '');
  const version = action === 'create' ? null : Number(input.version);
  if (action !== 'create' && (!/^[a-f0-9]{32}$/.test(id) || !Number.isInteger(version) || version < 1)) {
    throw new MapError('errors.activityIdentity');
  }
  if (action === 'delete') return { action, id, version };

  const name = normalizedName(input.name);
  const category = enumValue(input.category, ACTIVITY_CATEGORIES, 'errors.activityCategory');
  const featureType = enumValue(input.featureType, ACTIVITY_FEATURE_TYPES, 'errors.activityType');
  const isDraft = input.isDraft === true;
  if (input.isDraft !== undefined && typeof input.isDraft !== 'boolean') throw new MapError('errors.activityDraft');
  if (category === 'cycling' && featureType !== 'trail') throw new MapError('errors.activityCombination');
  const geometry = input.geometry === null || input.geometry === undefined
    ? null
    : activityGeometryKind(featureType) === 'polygon' ? validatePolygon(input.geometry).polygon.geometry : normalizePoint(input.geometry);
  if (!isDraft && !geometry) throw new MapError('errors.activityPublishedGeometry');
  const requestedColor = input.alpineColor === null || input.alpineColor === undefined || input.alpineColor === ''
    ? null : enumValue(input.alpineColor, ALPINE_COLORS, 'errors.activityColor');
  const alpineColor = category === 'alpine' && featureType === 'trail' ? requestedColor : null;
  if (requestedColor && alpineColor !== requestedColor) throw new MapError('errors.activityCombination');
  const activityNumber = normalizeActivityNumber(input.activityNumber, category);
  return { action, id, version, name, category, activityNumber, featureType, alpineColor, geometry, isDraft };
}

export function publicActivityFeatureRecord(row) {
  return {
    id: String(row.id),
    name: row.name,
    category: row.category,
    activityNumber: row.activity_number === null || row.activity_number === undefined ? null : String(row.activity_number),
    featureType: row.feature_type,
    alpineColor: row.alpine_color || null,
    geometry: typeof row.geometry === 'string' ? JSON.parse(row.geometry) : row.geometry,
  };
}

export function activityFeatureRecord(row) {
  return { ...publicActivityFeatureRecord(row), isDraft: Boolean(row.is_draft), version: Number(row.version) };
}
