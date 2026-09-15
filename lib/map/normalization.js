export function nullableText(value) {
  return typeof value === 'string' && value.trim() ? value.trim().normalize('NFC') : null;
}

export function normalizeAddress(value) {
  return (nullableText(value) || '').toLocaleLowerCase('nb-NO').replace(/\s+/gu, ' ').replace(/(\d)\s+([a-zæøå])$/u, '$1$2');
}

export function cadastralInteger(value) {
  if (value === null || value === undefined || value === '' || !/^\d+$/.test(String(value).trim())) return null;
  const number = Number(String(value).trim());
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

export function normalizeCadastral(value = {}) {
  const parts = typeof value === 'string' ? value.trim().split(/\s*\/\s*/) : null;
  if (parts && (parts.length < 2 || parts.length > 4 || parts.some((p) => !/^\d+$/.test(p)))) {
    return { gnr: null, bnr: null, fnr: null, snr: null };
  }
  const result = Object.fromEntries(['gnr', 'bnr', 'fnr', 'snr'].map((key, index) => [key, cadastralInteger(parts ? parts[index] : value?.[key])]));
  // A missing identifier is not the same as the explicit value zero.
  if (result.gnr === 0) result.gnr = null;
  if (result.bnr === 0) result.bnr = null;
  return result;
}

export function propertyLabel(value) {
  const p = normalizeCadastral(value);
  if (p.gnr === null || p.bnr === null) return '–';
  return `${p.gnr}/${p.bnr}${p.fnr > 0 ? ` fnr. ${p.fnr}` : ''}${p.snr > 0 ? ` snr. ${p.snr}` : ''}`;
}

export function addressLabel(address) {
  return address?.address || [address?.addressName, address?.houseNumber === null || address?.houseNumber === undefined ? null : `${address.houseNumber}${address.houseLetter || ''}`].filter(Boolean).join(' ') || 'Ukjent adresse';
}

export function sortAddresses(addresses, descending = false) {
  const collator = new Intl.Collator('nb-NO', { numeric: true, sensitivity: 'base' });
  return [...addresses].sort((a, b) => (descending ? -1 : 1) * (
    collator.compare(a.addressName || a.address || '', b.addressName || b.address || '')
    || (a.houseNumber ?? Infinity) - (b.houseNumber ?? Infinity)
    || collator.compare(a.houseLetter || '', b.houseLetter || '')
    || collator.compare(addressLabel(a), addressLabel(b))));
}
