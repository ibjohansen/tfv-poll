// Presentation-independent background provider configuration. The URL/axis
// order is verified against https://cache.kartverket.no/ (2026-09-15).
export const BACKGROUND_MAP = {
  url: 'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png',
  attribution: '© <a href="https://www.kartverket.no/">Kartverket</a>',
  maxZoom: 19,
};

// Open Topografisk Norgeskart WMS, verified against GetCapabilities and a
// Turufjell GetMap response on 2026-09-17. The detailed FKB building polygons
// are only rendered by the provider at approximately 1:12 000 and closer.
export const BUILDING_MAP = {
  url: 'https://wms.geonorge.no/skwms1/wms.topo',
  attribution: 'Bygninger: © <a href="https://data.norge.no/nb/data-services/68959b9b-1e1e-3ec3-b532-d2dbab6c1ced/topografisk-norgeskart-wms">Kartverket</a> (CC BY 4.0)',
  layers: 'bygning',
  version: '1.1.1',
  format: 'image/png',
  minZoom: 16,
  maxZoom: 19,
  opacity: 0.82,
};
