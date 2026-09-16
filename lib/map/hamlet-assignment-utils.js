import { containsPoint, validatePolygon } from './geo.js';
import { normalizeCadastral } from './normalization.js';

export function expectedHamletProperty(cadastralNumber, sectionNumber) {
  const property = normalizeCadastral(cadastralNumber);
  const section = Number.parseInt(String(sectionNumber || ''), 10);
  if (Number.isSafeInteger(section) && section > 0) property.snr = section;
  return property.gnr !== null && property.bnr !== null ? property : null;
}

export function addressPointCoordinates(candidate) {
  const point = candidate?.representasjonspunkt;
  const coordinates = [Number(point?.lon), Number(point?.lat)];
  return coordinates.every(Number.isFinite) && ['EPSG:4258', 'EPSG:4326'].includes(point?.epsg)
    ? coordinates : null;
}

export function hamletsContainingPoint(rows, coordinates) {
  return rows.filter((row) => {
    try { return containsPoint(validatePolygon(row.polygon).polygon, coordinates); }
    catch { return false; }
  });
}
