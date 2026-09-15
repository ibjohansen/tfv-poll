import { addressLabel, propertyLabel, sortAddresses } from './normalization.js';

function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  // Neutralize spreadsheet formulas even after leading whitespace/control chars.
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function toCsv(headers, rows) {
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function addressesCsv(addresses) {
  return toCsv(['Adresse', 'Gatenavn', 'Husnummer', 'Bokstav', 'Postnummer', 'Poststed', 'Kommune', 'Gnr', 'Bnr', 'Fnr', 'Snr', 'Latitude', 'Longitude', 'Kilde'],
    sortAddresses(addresses).map((a) => [addressLabel(a), a.addressName, a.houseNumber, a.houseLetter, a.postalCode, a.postalPlace,
      [a.municipalityNumber, a.municipalityName].filter(Boolean).join(' '), a.gnr, a.bnr, a.fnr, a.snr, a.latitude, a.longitude, `${a.source} (${a.license})`]));
}

export function comparisonCsv(comparison) {
  return toCsv(['Offisiell adresse', 'H-nummer', 'Gnr/Bnr Kartverket', 'Gnr/Bnr register', 'Registerstatus', 'Eier/medlem', 'E-post', 'Telefon', 'Merknad', 'Adresse i register', 'Kilder'],
    comparison.rows.map((row) => [row.officialAddresses.map(addressLabel).join(' | '), row.register?.hNumber,
      row.officialAddresses.map(propertyLabel).join(' | '), row.register ? propertyLabel(row.register) : null, row.status,
      row.register?.owners?.join(' | '), row.register?.emails?.join(' | '), row.register?.phones?.join(' | '),
      row.notes.join(' '), row.register?.address, 'Kartverket (CC BY 4.0); interne registerfelt: Turufjell vel']));
}

export function mapGeoJson(polygon, addresses = [], roads = [], boundaries = []) {
  return {
    type: 'FeatureCollection',
    features: [polygon, ...addresses.filter((a) => a.feature).map((a) => a.feature),
      ...roads.map(({ geometry, ...properties }) => ({ type: 'Feature', id: properties.id, properties, geometry })),
      ...boundaries.map((item) => item.feature)],
  };
}

export function uniqueRoadNames(addresses, roads) {
  // Official street names and supplementary OSM names are a union, never used
  // to replace an official address. Sources remain visible in the tables.
  return [...new Set([...addresses.map((a) => a.addressName), ...roads.map((r) => r.name)].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'nb-NO', { numeric: true }));
}
