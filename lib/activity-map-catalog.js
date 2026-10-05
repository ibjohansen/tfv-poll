import { MapError } from './map/errors.js';

// Stable IDs preserve existing activities. These are seeds, not runtime enums.
export const DEFAULT_ACTIVITY_CATALOG = {
  categories: [
    { id: 'cycling', name: 'Sykkel', color: '#16745a', version: 1 },
    { id: 'alpine', name: 'Alpint', color: '#7d3147', version: 1 },
    { id: 'hiking', name: 'Tur', color: '#a66321', version: 1 },
    { id: 'cross_country', name: 'Langrenn', color: '#2f6fb0', version: 1 },
    { id: 'retail', name: 'Utsalg', color: '#00546c', version: 1 },
    { id: 'training', name: 'Trening', color: '#326981', version: 1 },
    { id: 'parking', name: 'Parkering', color: '#00546c', version: 1 },
    { id: 'wc', name: 'WC', color: '#00546c', version: 1 },
  ],
  types: [
    { id: 'trail', category: 'cycling', name: 'Løype', geometryKind: 'polygon', version: 1 },
    { id: 'trail', category: 'alpine', name: 'Løype', geometryKind: 'polygon', version: 1 },
    { id: 'lift', category: 'alpine', name: 'Heis', geometryKind: 'polygon', version: 1 },
    { id: 'park', category: 'alpine', name: 'Park', geometryKind: 'point', version: 1 },
    { id: 'sledding', category: 'alpine', name: 'Akebakke', geometryKind: 'point', version: 1 },
    { id: 'route', category: 'hiking', name: 'Turrute', geometryKind: 'line', version: 1 },
    { id: 'route', category: 'cross_country', name: 'Løype', geometryKind: 'line', version: 1 },
    { id: 'point', category: 'retail', name: 'Sted', geometryKind: 'point', version: 1 },
    { id: 'point', category: 'training', name: 'Trening', geometryKind: 'point', version: 1 },
    { id: 'parking', category: 'parking', name: 'Parkering', geometryKind: 'point', version: 1 },
    { id: 'restroom', category: 'wc', name: 'WC', geometryKind: 'point', version: 1 },
  ],
  subtypes: [
    { id: 'bowl_lift', category: 'alpine', featureType: 'lift', name: 'Skålheis', version: 1 },
    { id: 't_bar', category: 'alpine', featureType: 'lift', name: 'T-krok', version: 1 },
    { id: 'chairlift', category: 'alpine', featureType: 'lift', name: 'Stolheis', version: 1 },
    { id: 'gondola', category: 'alpine', featureType: 'lift', name: 'Gondol', version: 1 },
    { id: 'serving', category: 'retail', featureType: 'point', name: 'Servering', version: 1 },
  ],
};

export function findActivityType(catalog, category, id) {
  return catalog.types.find((type) => type.category === category && type.id === id);
}

export function findActivitySubtype(catalog, category, featureType, id) {
  return (catalog.subtypes || []).find((subtype) => subtype.category === category && subtype.featureType === featureType && subtype.id === id);
}

// Existing translated labels are retained until an administrator renames them.
export function activityCatalogLabel(record, kind, t) {
  const original = DEFAULT_ACTIVITY_CATALOG[kind].find((item) => item.id === record.id
    && (kind === 'categories' || item.category === record.category));
  const translationKey = kind === 'types' && record.category === 'cross_country'
    ? 'types.cross_country_route' : `${kind}.${record.id}`;
  return original?.name === record.name ? t(translationKey) : record.name;
}

export function activityCategoryLabel(feature, t) {
  const record = { id: feature.category, name: feature.categoryName };
  record.name ||= DEFAULT_ACTIVITY_CATALOG.categories.find((item) => item.id === record.id)?.name || record.id;
  return activityCatalogLabel(record, 'categories', t);
}

export function activityTypeLabel(feature, t) {
  const record = { id: feature.featureType, category: feature.category, name: feature.typeName };
  record.name ||= findActivityType(DEFAULT_ACTIVITY_CATALOG, record.category, record.id)?.name || record.id;
  return activityCatalogLabel(record, 'types', t);
}

export function activitySubtypeLabel(feature, t) {
  const record = { id: feature.featureSubtype, category: feature.category, featureType: feature.featureType, name: feature.subtypeName };
  record.name ||= findActivitySubtype(DEFAULT_ACTIVITY_CATALOG, record.category, record.featureType, record.id)?.name || record.id;
  const original = findActivitySubtype(DEFAULT_ACTIVITY_CATALOG, record.category, record.featureType, record.id);
  return original?.name === record.name ? t(`subtypes.${record.id}`) : record.name;
}

export function activityCategoryColor(feature) {
  return feature.categoryColor || DEFAULT_ACTIVITY_CATALOG.categories.find((item) => item.id === feature.category)?.color || '#20636c';
}

export function withActivityCatalog(feature, catalog) {
  const category = catalog.categories.find((item) => item.id === feature.category);
  const type = findActivityType(catalog, feature.category, feature.featureType);
  const subtype = findActivitySubtype(catalog, feature.category, feature.featureType, feature.featureSubtype);
  return { ...feature, categoryName: category?.name, categoryColor: category?.color,
    typeName: type?.name, subtypeName: subtype?.name, geometryKind: type?.geometryKind };
}

export function normalizeActivityCatalogInput(input) {
  if (!input || !['category', 'type'].includes(input.kind) || !['create', 'update'].includes(input.action)) {
    throw new MapError('errors.invalidOptions');
  }
  if (typeof input.name !== 'string' || input.name.length > 80 || !input.name.trim()) throw new MapError('errors.activityCatalogName');
  const name = input.name.trim().replace(/\s+/g, ' ');
  const validId = (id) => typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id);
  if (input.action === 'update' && (!validId(input.id) || !Number.isInteger(input.version) || input.version < 1)) {
    throw new MapError('errors.activityIdentity');
  }
  if (input.kind === 'type' && !validId(input.category)) throw new MapError('errors.activityCategory');
  if (input.kind === 'type' && !['polygon', 'line', 'point'].includes(input.geometryKind)) throw new MapError('errors.activityCatalogGeometry');
  if (input.kind === 'category' && (typeof input.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(input.color))) {
    throw new MapError('errors.activityCatalogColor');
  }
  return { action: input.action, kind: input.kind, id: input.id, version: input.version, name,
    category: input.category, geometryKind: input.geometryKind, color: input.kind === 'category' ? input.color.toLowerCase() : undefined };
}
