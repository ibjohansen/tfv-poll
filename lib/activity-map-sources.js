export const ACTIVITY_MAP_SOURCES = Object.freeze({
  kartverket: Object.freeze({
    id: 'kartverket',
    name: 'Kartverket',
    priority: 10,
    sourceUrl: 'https://kartverket.no/api-og-data/friluftsliv',
    licenseName: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/deed.no',
  }),
  openstreetmap: Object.freeze({
    id: 'openstreetmap',
    name: 'OpenStreetMap',
    priority: 20,
    sourceUrl: 'https://www.openstreetmap.org/copyright',
    licenseName: 'ODbL',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
  }),
});

export const ACTIVITY_MAP_SOURCE_IDS = Object.freeze(Object.keys(ACTIVITY_MAP_SOURCES));

export const CROSS_COUNTRY_CATEGORY = Object.freeze({
  id: 'cross_country', name: 'Langrenn', color: '#2f6fb0',
  type: Object.freeze({ id: 'route', name: 'Løype', geometryKind: 'line' }),
});

export const ACTIVITY_MAP_EXTERNAL_LINKS = Object.freeze([
  Object.freeze({ id: 'sporet', url: 'https://sporet.no/' }),
  Object.freeze({ id: 'norgeskart', url: 'https://www.norgeskart.no/' }),
  Object.freeze({ id: 'opensnowmap', url: 'https://www.opensnowmap.org/' }),
]);

export function publicActivitySources(sourceIds) {
  let ids = [];
  if (Array.isArray(sourceIds)) ids = sourceIds;
  else if (typeof sourceIds === 'string') {
    try { ids = JSON.parse(sourceIds); } catch { ids = []; }
  }
  if (!Array.isArray(ids)) ids = [];
  return [...new Set(ids)].map((id) => ACTIVITY_MAP_SOURCES[id]).filter(Boolean)
    .sort((a, b) => a.priority - b.priority)
    .map(({ priority: _priority, ...source }) => source);
}
