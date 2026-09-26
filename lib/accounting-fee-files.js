import { parse } from 'csv-parse/sync';
import { AccountingError, decimalString } from './accounting-validation.js';

function normalizedHeader(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const memberIdHeaders = new Set(['member_id', 'medlem_id', 'medlems_id', 'medlemsid']);
const hNumberHeaders = new Set(['h_number', 'h_nummer', 'hnummer', 'h_nr']);

export function parseFeeStatusCsv(text) {
  if (typeof text !== 'string' || !text.trim()) throw new AccountingError('invalidFeeImport');
  let records;
  try {
    records = parse(text, { bom: true, columns: (headers) => headers.map(normalizedHeader), delimiter: [',', ';', '\t'],
      skip_empty_lines: true, trim: true, relax_column_count: false, max_record_size: 10_000 });
  } catch { throw new AccountingError('invalidFeeImport'); }
  if (!records.length || records.length > 10_000) throw new AccountingError('invalidFeeImport');
  const headers = new Set(Object.keys(records[0]));
  const memberIdHeader = [...memberIdHeaders].find((header) => headers.has(header));
  const hNumberHeader = [...hNumberHeaders].find((header) => headers.has(header));
  if (!memberIdHeader && !hNumberHeader) throw new AccountingError('invalidFeeImport');
  const seen = new Set();
  return records.map((record) => {
    const memberId = memberIdHeader ? String(record[memberIdHeader] || '').trim() : '';
    const hNumber = hNumberHeader ? String(record[hNumberHeader] || '').trim() : '';
    const identifier = memberId ? { type: 'member_id', value: memberId } : { type: 'h_number', value: hNumber };
    if ((identifier.type === 'member_id' && !/^[1-9]\d{0,18}$/.test(identifier.value))
      || (identifier.type === 'h_number' && (!identifier.value || identifier.value.length > 100))) throw new AccountingError('invalidFeeImport');
    const key = `${identifier.type}:${identifier.value.toLocaleLowerCase('nb-NO')}`;
    if (seen.has(key)) throw new AccountingError('duplicateFeeImport');
    seen.add(key);
    return identifier;
  });
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function collectionCandidatesCsv({ year, annualFeeOre, members }, t) {
  const headers = [t('year'), t('memberId'), t('hNumber'), t('cadastralNumber'), t('sectionNumber'), t('streetAddress'),
    t('titleHolder'), t('contactName'), t('contactEmail'), t('otherEmails'), t('invoicedOn'), t('claimAmount')];
  const rows = members.map((member) => [year, member.id, member.h_number, member.cadastral_number, member.section_number,
    member.street_address, member.title_holder, member.primary_contact_name, member.primary_contact_email,
    (member.other_contact_emails || []).join(' | '), member.invoiced_on, decimalString(annualFeeOre)]);
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
