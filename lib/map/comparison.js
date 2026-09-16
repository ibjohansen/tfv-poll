import { normalizeAddress, normalizeCadastral } from './normalization.js';
import { containsPoint } from './geo.js';

export const COMPARISON_STATUSES = ['MATCH', 'MISSING_IN_REGISTER', 'MISSING_IN_MAP_DATA', 'POSSIBLE_MATCH', 'CONFLICT'];
function sameMunicipality(a, b) {
  return !a.municipalityNumber || !b.municipalityNumber || a.municipalityNumber === b.municipalityNumber;
}

function sameBase(a, b) {
  return a.gnr !== null && a.bnr !== null && a.gnr === b.gnr && a.bnr === b.bnr;
}

function differentKnown(a, b) {
  return ['gnr', 'bnr', 'fnr', 'snr'].some((key) => a[key] !== null && b[key] !== null && a[key] !== b[key]);
}

export function compareRegisterWithMapData(registerProperties, officialAddresses, { polygon, boundaries = [], t = (key) => key } = {}) {
  const officials = officialAddresses.map((value) => ({ ...value, ...normalizeCadastral(value) }));
  const addressIndex = new Map();
  const propertyIndex = new Map();
  for (const official of officials) {
    const address = normalizeAddress(official.address);
    if (address) addressIndex.set(address, [...(addressIndex.get(address) || []), official]);
    if (official.gnr !== null && official.bnr !== null) {
      const key = `${official.gnr}/${official.bnr}`;
      propertyIndex.set(key, [...(propertyIndex.get(key) || []), official]);
    }
  }
  const used = new Set();
  const rows = registerProperties.map((value, index) => {
    const register = { ...value, ...normalizeCadastral(value) };
    const address = normalizeAddress(register.address);
    const byProperty = (propertyIndex.get(`${register.gnr}/${register.bnr}`) || []).filter((o) => sameMunicipality(register, o));
    const byAddress = (addressIndex.get(address) || []).filter((o) => sameMunicipality(register, o));
    const exact = byAddress.filter((o) => sameBase(register, o));
    // An address pointing to a different parcel must never disappear merely
    // because another address happens to match the register's parcel number.
    const conflict = byAddress.some((o) => differentKnown(register, o));
    let candidates = conflict ? [...new Map([...byAddress, ...byProperty].map((o) => [o.id, o])).values()]
      : exact.length ? exact : byAddress.length ? byAddress : byProperty;
    // Distinct known sections/leaseholds can disambiguate a shared base number.
    if (!conflict && candidates.length > 1) {
      const full = candidates.filter((o) => !differentKnown(register, o));
      if (full.length) candidates = full;
    }
    let status = !candidates.length ? 'MISSING_IN_MAP_DATA' : conflict ? 'CONFLICT' : candidates.length > 1 ? 'POSSIBLE_MATCH' : 'MATCH';
    const notes = [];
    if (register.gnr === null || register.bnr === null) notes.push(t('comparison.missingRegisterCadastral'));
    if (!address) notes.push(t('comparison.missingRegisterAddress'));
    if (!candidates.length) notes.push(t('comparison.noMapLink'));
    if (candidates.length === 1 && !conflict) {
      const official = candidates[0];
      if (differentKnown(register, official)) status = 'CONFLICT';
      else if (address && normalizeAddress(official.address) && address !== normalizeAddress(official.address)) status = 'CONFLICT';
      else if (['fnr', 'snr'].some((key) => (register[key] > 0 && official[key] === null) || (official[key] > 0 && register[key] === null))) {
        status = 'POSSIBLE_MATCH'; notes.push(t('comparison.unconfirmedLeasehold'));
      }
      if (official.gnr === null || official.bnr === null) notes.push(t('comparison.missingMapCadastral'));
    }
    if (status === 'CONFLICT') notes.push(t('comparison.conflict'));
    if (candidates.length > 1) notes.push(t('comparison.multipleCandidates'));
    candidates.forEach((o) => used.add(o.id));
    let scope = 'address_in_polygon';
    if (!candidates.length) {
      // A cadastral match proves only that a parcel touches the search area,
      // not that an unknown address point is inside it. Never geocode by guess.
      const parcel = boundaries.some((b) => b.references.some((reference) =>
        register.municipalityNumber && register.municipalityNumber === reference.municipalityNumber
        && sameBase(register, normalizeCadastral(reference)) && !differentKnown(register, normalizeCadastral(reference))));
      const point = [register.longitude, register.latitude];
      const located = polygon && point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;
      scope = located ? containsPoint(polygon, point) ? 'point_in_polygon' : 'outside_polygon' : parcel ? 'parcel_intersects' : 'unknown';
      if (scope === 'unknown') notes.push(t('comparison.unknownLocation'));
      if (scope === 'parcel_intersects') notes.push(t('comparison.parcelWithoutAddress'));
    }
    return { id: `register:${register.id ?? index}`, register, officialAddresses: candidates,
      status: ['unknown', 'outside_polygon'].includes(scope) ? null : status, scope, notes };
  });
  const links = new Map();
  rows.forEach((row) => row.officialAddresses.forEach((o) => links.set(o.id, (links.get(o.id) || 0) + 1)));
  rows.forEach((row) => {
    if (row.officialAddresses.some((o) => links.get(o.id) > 1)) {
      row.notes.push(t('comparison.duplicateLink'));
      if (row.status === 'MATCH') row.status = 'POSSIBLE_MATCH';
    }
  });
  for (const official of officials) if (!used.has(official.id)) rows.push({
    id: `official:${official.id}`, register: null, officialAddresses: [official], status: 'MISSING_IN_REGISTER', scope: 'address_in_polygon', notes: [t('comparison.missingInRegister')],
  });
  return {
    rows: rows.filter((row) => !['unknown', 'outside_polygon'].includes(row.scope)),
    unlocatedRows: rows.filter((row) => row.scope === 'unknown'),
    outsideCount: rows.filter((row) => row.scope === 'outside_polygon').length,
    counts: Object.fromEntries(COMPARISON_STATUSES.map((status) => [status, rows.filter((row) => row.status === status && !['unknown', 'outside_polygon'].includes(row.scope)).length])),
    officialCount: officials.length, registerCount: registerProperties.length,
    scope: t('comparison.scope'),
  };
}
