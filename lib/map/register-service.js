import 'server-only';
import { getSql } from '../db.js';
import { requirePermission } from '../admin-access.js';
import { isMockMode } from '../mock-store.js';
import { mockMembers } from '../../data/mock-members.js';
import { MapError } from './geo.js';
import { cadastralInteger, normalizeCadastral, nullableText } from './normalization.js';

export function normalizeRegisterProperty(row, includeContacts = false) {
  const cadastral = normalizeCadastral(row.cadastral_number || '');
  return {
    id: String(row.id), address: nullableText(row.street_address), hNumber: nullableText(row.h_number),
    ...cadastral, snr: cadastralInteger(row.section_number) ?? cadastral.snr,
    // This register is scoped to Turufjell, Flå, not a nationwide member index.
    municipalityNumber: '3320', source: 'Turufjell vel',
    owners: [nullableText(row.title_holder), nullableText(row.primary_contact_name)].filter((value, index, all) => value && all.indexOf(value) === index),
    ...(includeContacts ? {
      emails: [...new Set([nullableText(row.primary_contact_email), ...(row.other_contact_emails || []).map(nullableText)].filter(Boolean))],
      // No telephone field exists in the current register schema.
      phones: [],
    } : {}),
  };
}

export async function getRegisterProperties({ includeContacts = false, hamletId = null } = {}) {
  await requirePermission('members');
  if (hamletId !== null && !/^[1-9][0-9]{0,15}$/.test(String(hamletId))) throw new MapError('Velg en gyldig grend.');
  let rows;
  if (isMockMode()) rows = hamletId === null ? mockMembers : mockMembers.filter((row) => String(row.hamlet_id) === String(hamletId));
  else {
    const sql = getSql();
    rows = includeContacts ? await sql`
      SELECT id, h_number, cadastral_number, section_number, street_address,
        title_holder, primary_contact_name, primary_contact_email, other_contact_emails
      FROM members WHERE deleted_at IS NULL
        AND (${hamletId}::bigint IS NULL OR hamlet_id = ${hamletId})
      ORDER BY id LIMIT 5001
    ` : await sql`
      SELECT id, h_number, cadastral_number, section_number, street_address,
        title_holder, primary_contact_name
      FROM members WHERE deleted_at IS NULL
        AND (${hamletId}::bigint IS NULL OR hamlet_id = ${hamletId})
      ORDER BY id LIMIT 5001
    `;
  }
  if (rows.length > 5000) throw new MapError('Registeret er for stort for denne sammenligningen. Ingen delvis rapport er laget.', 413);
  return rows.map((row) => normalizeRegisterProperty(row, includeContacts));
}
