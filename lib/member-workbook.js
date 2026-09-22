import ExcelJS from 'exceljs';
const columns = [
  ['h_number', 'H-nummer', 14],
  ['cadastral_number', 'Gårds- og bruksnummer', 23],
  ['section_number', 'Seksjonsnummer', 18],
  ['street_address', 'Gateadresse', 32],
  ['title_holder', 'Hjemmelshaver', 38],
  ['registration_date', 'Tinglysningsdato', 24],
  ['primary_contact_name', 'Kontaktperson', 28],
  ['primary_contact_email', 'Hoved-e-post', 34],
  ['other_contact_emails', 'Andre e-postadresser', 42],
  ['membership_status', 'Medlemsstatus', 24],
  ['hamlet_name', 'Grend', 24],
];

function text(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.join('; ');
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nei';
  return String(value);
}

function sortableNumber(value) {
  const stringValue = text(value);
  if (!/^\d{1,15}$/.test(stringValue)) return stringValue;
  const numberValue = Number(stringValue);
  return Number.isSafeInteger(numberValue) ? numberValue : stringValue;
}

export async function buildMemberWorkbook({ members }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Medlemsservice';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Medlemmer', {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { defaultRowHeight: 20 },
  });
  sheet.columns = columns.map(([key, header, width]) => ({ key, header, width }));
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(columns.length).letter}1` };
  const header = sheet.getRow(1);
  header.height = 30;
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF315B49' } };
  header.alignment = { vertical: 'middle', wrapText: true };

  for (const member of members) {
    const row = sheet.addRow({
      ...Object.fromEntries(columns.map(([key]) => [key, text(member[key])])),
      membership_status: member.membership_status === 'exempt' ? 'Unntatt medlemskap' : 'Ordinært medlem',
      h_number: sortableNumber(member.h_number),
    });
    row.alignment = { vertical: 'top', wrapText: true };
  }
  return workbook.xlsx.writeBuffer();
}
