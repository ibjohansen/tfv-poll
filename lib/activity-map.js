import { ACTIVITY_MAP_CENTER, ALPINE_COLORS, ACTIVITY_SEASONS, normalizeActivityNumber } from './activity-map-display.js';
export { ACTIVITY_MAP_CENTER, ALPINE_COLORS, ACTIVITY_SEASONS, normalizeActivityNumber, activityMatchesSeason, activityMatchesTurufjell, smoothActivityGeometry } from './activity-map-display.js';
import { distance } from '@turf/turf';
import { MapError, validatePolygon } from './map/geo.js';
import { DEFAULT_ACTIVITY_CATALOG, findActivityType } from './activity-map-catalog.js';
import { publicActivitySources } from './activity-map-sources.js';

export function normalizeActivityWebsite(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value.trim())) throw new MapError('errors.activityWebsite');
  let url;
  try { url = new URL(value.trim()); } catch { throw new MapError('errors.activityWebsite'); }
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.href.length > 2048) throw new MapError('errors.activityWebsite');
  return url.href;
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

function normalizedTooltipText(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > 300) throw new MapError('errors.activityTooltipText');
  const text = value.trim().replace(/\s+/g, ' ');
  return text || null;
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

function normalizeLine(input) {
  const geometry = input?.type === 'Feature' ? input.geometry : input;
  const coordinates = geometry?.coordinates;
  if (geometry?.type !== 'LineString' || !Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 200
    || coordinates.some((point) => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)
      || point[0] < -180 || point[0] > 180 || point[1] < -90 || point[1] > 90)
    || coordinates.some((point, index) => index > 0 && point[0] === coordinates[index - 1][0] && point[1] === coordinates[index - 1][1])) {
    throw new MapError('errors.activityLine');
  }
  if (coordinates.some((point) => distance(ACTIVITY_MAP_CENTER, point, { units: 'kilometers' }) > 20)) {
    throw new MapError('errors.polygonLocation');
  }
  return { type: 'LineString', coordinates: coordinates.map((point) => [...point]) };
}

export function normalizeActivityFeatureInput(input, catalog = DEFAULT_ACTIVITY_CATALOG) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new MapError('errors.invalidOptions');
  const action = enumValue(input.action, ['create', 'update', 'delete'], 'errors.activityAction');
  const id = action === 'create' ? null : String(input.id || '');
  const version = action === 'create' ? null : Number(input.version);
  if (action !== 'create' && (!/^[a-f0-9]{32}$/.test(id) || !Number.isInteger(version) || version < 1)) {
    throw new MapError('errors.activityIdentity');
  }
  if (action === 'delete') return { action, id, version };

  const name = normalizedName(input.name);
  const tooltipText = normalizedTooltipText(input.tooltipText);
  const season = input.season == null || input.season === '' ? null
    : enumValue(input.season, ACTIVITY_SEASONS, 'errors.activitySeason');
  const websiteUrl = normalizeActivityWebsite(input.websiteUrl);
  const category = enumValue(input.category, catalog.categories.map((item) => item.id), 'errors.activityCategory');
  const featureType = input.featureType;
  const typeDefinition = findActivityType(catalog, category, featureType);
  if (!typeDefinition) throw new MapError('errors.activityCombination');
  const isDraft = input.isDraft === true;
  if (input.isDraft !== undefined && typeof input.isDraft !== 'boolean') throw new MapError('errors.activityDraft');
  const geometryKind = typeDefinition.geometryKind;
  const geometry = input.geometry === null || input.geometry === undefined
    ? null
    : geometryKind === 'polygon' ? validatePolygon(input.geometry).polygon.geometry
      : geometryKind === 'line' ? normalizeLine(input.geometry) : normalizePoint(input.geometry);
  if (!isDraft && !geometry) throw new MapError('errors.activityPublishedGeometry');
  const requestedColor = input.alpineColor === null || input.alpineColor === undefined || input.alpineColor === ''
    ? null : enumValue(input.alpineColor, ALPINE_COLORS, 'errors.activityColor');
  const alpineColor = category === 'alpine' && featureType === 'trail' ? requestedColor : null;
  if (requestedColor && alpineColor !== requestedColor) throw new MapError('errors.activityCombination');
  const activityNumber = normalizeActivityNumber(input.activityNumber, category);
  return { action, id, version, name, tooltipText, season, websiteUrl, category, activityNumber, featureType, alpineColor, geometry, isDraft };
}

export function publicActivityFeatureRecord(row) {
  return {
    id: String(row.id),
    name: row.name,
    tooltipText: row.tooltip_text || null,
    season: row.season || null,
    websiteUrl: row.website_url || null,
    category: row.category,
    categoryName: row.category_name,
    categoryColor: row.category_color,
    typeName: row.type_name,
    geometryKind: row.geometry_kind,
    activityNumber: row.activity_number === null || row.activity_number === undefined ? null : String(row.activity_number),
    featureType: row.feature_type,
    alpineColor: row.alpine_color || null,
    geometry: typeof row.geometry === 'string' ? JSON.parse(row.geometry) : row.geometry,
    sources: publicActivitySources(row.source_ids),
  };
}

export function activityFeatureRecord(row) {
  return { ...publicActivityFeatureRecord(row), isDraft: Boolean(row.is_draft), version: Number(row.version),
    sourceManaged: row.geometry_origin === 'external' };
}
