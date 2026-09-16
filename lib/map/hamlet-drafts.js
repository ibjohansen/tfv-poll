import catalog from '../../data/map-hamlet-drafts.json' with { type: 'json' };
import { MapError, validatePolygon } from './geo.js';

// This optional reference catalog is not the live hamlet register. Nothing is
// persisted until the administrator explicitly saves through the existing API.
export const HAMLET_DRAFT_OPTIONS = catalog.features.map(({ id, properties }) => ({ id, name: properties.name }));

const nameKey = (name) => name.normalize('NFC').trim().toLocaleLowerCase('nb-NO');

export function prepareHamletDraft(id, hamlets = []) {
  const feature = catalog.features.find((f) => f.id === id);
  if (!feature) throw new MapError('Velg et gyldig kartutkast.');
  const name = feature.properties.name;
  const candidates = hamlets.filter((h) => nameKey(h.name) === nameKey(name));
  if (candidates.length > 1) throw new MapError('Flere grender har tilsvarende navn. Velg riktig grend fra listen over lagrede grender.');
  const current = candidates[0] || null;
  if (current?.polygon) throw new MapError('Grenden har allerede et lagret polygon. Velg den under «Lagret grend» for å redigere. Kartutkastet overskriver ikke lagrede grenser.');
  const { polygon, areaM2 } = validatePolygon(feature);
  return {
    current,
    draft: { id: feature.id, name: current?.name || name, reviewed: false, imageDraft: true,
      source: feature.properties.source, areaM2: Math.round(areaM2),
      polygon: { ...polygon, properties: { kind: 'hamlet', name: current?.name || name,
        source: feature.properties.source, reviewed: false, draft: true } } },
  };
}
