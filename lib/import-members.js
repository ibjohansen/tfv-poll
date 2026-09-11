import { parse } from 'csv-parse/sync';
import { createHash } from 'node:crypto';

const columns = ['H-nummer', 'Matrikkel-GNR/BR', 'Tomt/Adresse', 'Matrikkel-tinglyst dato', 'Matrikkel-eier', 'Hoved-epost', 'Extra-epost', 'Kommentar'];

export function parseMembersCsv(source) {
  const rows = parse(source, { bom: true, delimiter: ';', skip_empty_lines: true, relax_column_count: true });
  const start = rows.findIndex((row) => row.some((value) => value.trim() === 'H-nummer'));
  if (start < 0) throw new Error('Fant ikke kolonneoverskriften H-nummer.');
  const header = rows[start].map((value) => value.trim());
  for (const name of columns) if (!header.includes(name)) throw new Error(`Mangler kolonnen ${name}.`);
  if (new Set(header).size !== header.length) throw new Error('Dupliserte kolonneoverskrifter.');
  const members = [];
  const skipped = [];
  const keys = new Set();
  const hNumbers = new Set();
  for (const [index, row] of rows.slice(start + 1).entries()) {
    if (row.every((value) => !value.trim())) continue;
    const rowNumber = start + index + 2;
    if (row.length !== header.length) throw new Error(`Rad ${rowNumber}: feil antall kolonner.`);
    const record = Object.fromEntries(header.map((name, i) => [name, row[i]]));
    const h = record['H-nummer'].trim();
    const cadastral = record['Matrikkel-GNR/BR'].trim();
    const address = record['Tomt/Adresse'].trim();
    const reason = !h ? 'Mangler H-nummer' : !cadastral || !address ? 'Mangler matrikkelnummer eller adresse' : null;
    if (reason) { skipped.push({ row: rowNumber, reason }); continue; }
    const hNumber = h.toUpperCase() === 'N/A' ? 'N/A' : h;
    const importKey = createHash('sha256').update(JSON.stringify([cadastral.toLowerCase(), address.toLowerCase()])).digest('hex');
    if (keys.has(importKey) || (hNumber !== 'N/A' && hNumbers.has(hNumber.toUpperCase()))) {
      throw new Error(`Rad ${rowNumber}: duplisert tomt eller H-nummer. Importen er stoppet.`);
    }
    keys.add(importKey);
    hNumbers.add(hNumber.toUpperCase());
    members.push({
      import_key: importKey,
      h_number: hNumber,
      cadastral_number: cadastral,
      street_address: address,
      title_holder: record['Matrikkel-eier'] || null,
      registration_date: record['Matrikkel-tinglyst dato'] || null,
      primary_contact_name: record['Matrikkel-eier'] || null,
      primary_contact_email: record['Hoved-epost'].trim() || null,
      other_contact_emails: [...new Set(record['Extra-epost'].split(/[;,\s/]+/).map((value) => value.trim()).filter(Boolean))],
      admin_comment: record.Kommentar || null,
    });
  }
  return { members, skipped };
}

export function memberUpsert(sql, member) {
  return sql`
    INSERT INTO members (import_key, h_number, cadastral_number, street_address,
      title_holder, registration_date, primary_contact_name, primary_contact_email,
      other_contact_emails, admin_comment, last_changed_by)
    VALUES (${member.import_key}, ${member.h_number}, ${member.cadastral_number},
      ${member.street_address}, ${member.title_holder}, ${member.registration_date},
      ${member.primary_contact_name}, ${member.primary_contact_email},
      ${member.other_contact_emails}, ${member.admin_comment}, 'member-import')
    ON CONFLICT (import_key) DO UPDATE SET
      h_number = EXCLUDED.h_number,
      cadastral_number = EXCLUDED.cadastral_number,
      street_address = EXCLUDED.street_address,
      title_holder = EXCLUDED.title_holder,
      registration_date = EXCLUDED.registration_date,
      primary_contact_name = EXCLUDED.primary_contact_name,
      primary_contact_email = EXCLUDED.primary_contact_email,
      other_contact_emails = EXCLUDED.other_contact_emails,
      admin_comment = EXCLUDED.admin_comment,
      last_changed_by = 'member-import'
    RETURNING id
  `;
}
