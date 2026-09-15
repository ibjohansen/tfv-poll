// Presentation-independent background provider configuration. The URL/axis
// order is verified against https://cache.kartverket.no/ (2026-09-15).
export const BACKGROUND_MAP = {
  url: 'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png',
  attribution: '© <a href="https://www.kartverket.no/">Kartverket</a>',
  maxZoom: 19,
};
