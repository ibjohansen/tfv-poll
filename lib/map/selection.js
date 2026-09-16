import { normalizeCadastral } from './normalization.js';

function sameProperty(left, right) {
  const a = normalizeCadastral(left);
  const b = normalizeCadastral(right);
  if (a.gnr === null || a.bnr === null || a.gnr !== b.gnr || a.bnr !== b.bnr) return false;
  return ['fnr', 'snr'].every((key) => a[key] === null || b[key] === null || a[key] === b[key]);
}

export function comparisonRowsForSelection(selected, comparison) {
  if (!selected || !comparison) return [];
  if (selected.kind === 'comparison') return [selected];
  const rows = [...(comparison.rows || []), ...(comparison.unlocatedRows || [])];
  if (selected.memberId) return rows.filter((row) => String(row.register?.id) === String(selected.memberId));
  if (selected.kind === 'boundary') return rows.filter((row) => selected.references.some((reference) =>
    (row.register && sameProperty(reference, row.register)) || row.officialAddresses.some((address) => sameProperty(reference, address))));
  const addressIds = new Set(selected.kind === 'property'
    ? selected.addresses.map((address) => address.id)
    : selected.kind === 'address' ? [selected.id] : []);
  return rows.filter((row) => row.officialAddresses.some((address) => addressIds.has(address.id)));
}

export function memberIdsForSelection(selected, comparison) {
  return [...new Set(comparisonRowsForSelection(selected, comparison)
    .map((row) => row.register?.id).filter(Boolean).map(String))];
}
