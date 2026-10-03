import { getExportI18n } from './i18n/exports.js';
import ExcelJS from 'exceljs';
const columns = [
  ['h_number', 'h_number', 14],
  ['cadastral_number', 'cadastral_number', 23],
  ['section_number', 'section_number', 18],
  ['street_address', 'street_address', 32],
  ['title_holder', 'title_holder', 38],
  ['registration_date', 'registration_date', 24],
  ['primary_contact_name', 'primary_contact_name', 28],
  ['primary_contact_email', 'primary_contact_email', 34],
  ['other_contact_emails', 'other_contact_emails', 42],
  ['membership_status', 'membership_status', 24],
  ['hamlet_name', 'hamlet_name', 24],
];

function text(value, t) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.join('; ');
  if (typeof value === 'boolean') return value ? t('yes') : t('no');
  return String(value);
}

function sortableNumber(value, t) {
  const stringValue = text(value, t);
  if (!/^\d{1,15}$/.test(stringValue)) return stringValue;
  const numberValue = Number(stringValue);
  return Number.isSafeInteger(numberValue) ? numberValue : stringValue;
}

export async function buildMemberWorkbook({ members, locale = 'nb' }) {
  const { t } = getExportI18n(locale);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = t('creator');
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(t('members'), {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { defaultRowHeight: 20 },
  });
  sheet.columns = columns.map(([key, header, width]) => ({ key, header: t(header), width }));
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(columns.length).letter}1` };
  const header = sheet.getRow(1);
  header.height = 30;
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF315B49' } };
  header.alignment = { vertical: 'middle', wrapText: true };

  for (const member of members) {
    const row = sheet.addRow({
      ...Object.fromEntries(columns.map(([key]) => [key, text(member[key], t)])),
      membership_status: member.membership_status === 'exempt' ? t('exempt') : t('member'),
      h_number: sortableNumber(member.h_number, t),
    });
    row.alignment = { vertical: 'top', wrapText: true };
  }
  return workbook.xlsx.writeBuffer();
}
