import { propertyLabel } from './normalization.js';

// Open address references only. These are address locations, NOT parcel
// centroids/boundaries, a complete cadastral inventory or confirmed sections.
export function propertiesFromAddresses(addresses) {
  const properties = new Map();
  for (const address of addresses) {
    if (!address.gnr || !address.bnr) continue;
    const id = JSON.stringify([address.municipalityNumber, address.gnr, address.bnr, address.fnr, address.snr]);
    if (!properties.has(id)) properties.set(id, { id, gnr: address.gnr, bnr: address.bnr, fnr: address.fnr, snr: address.snr,
      municipalityNumber: address.municipalityNumber, label: propertyLabel(address), addresses: [],
      source: 'Kartverket', geometry: { type: 'MultiPoint', coordinates: [] }, boundaries: null });
    const property = properties.get(id);
    property.addresses.push(address);
    if (address.feature) property.geometry.coordinates.push(address.feature.geometry.coordinates);
  }
  return [...properties.values()];
}
