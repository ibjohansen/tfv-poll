import 'server-only';
import { randomUUID } from 'node:crypto';
import { requirePermission } from '../admin-access.js';
import { getSql } from '../db.js';
import { isMockMode } from '../mock-store.js';
import { findHamletForNewMember } from './member-hamlet-assignment.js';
import { normalizeAddress, normalizeCadastral, nullableText, propertyLabel } from './normalization.js';
import { MapError } from './geo.js';

const TASK_COMMENT = 'MAP_IMPORT_TASK: Kartimport – fyll inn H-nummer, kontaktperson og e-post.';

function candidate(value) {
  if (!value || typeof value !== 'object') throw new MapError('errors.invalidImport');
  const address = nullableText(value.address);
  const cadastral = normalizeCadastral(value);
  if (!address || address.length > 500 || cadastral.gnr === null || cadastral.bnr === null) throw new MapError('errors.invalidImport');
  return { address, cadastralNumber: propertyLabel(cadastral), sectionNumber: cadastral.snr ? String(cadastral.snr) : null };
}

export async function importMapMembers(input) {
  const user = await requirePermission('members');
  if (isMockMode()) throw new MapError('errors.importMock', 409);
  if (!Array.isArray(input?.addresses) || !input.addresses.length || input.addresses.length > 100) throw new MapError('errors.invalidImport');
  const candidates = [...new Map(input.addresses.map((value) => {
    const item = candidate(value); return [normalizeAddress(item.address), item];
  })).values()];
  const sql = getSql();
  const imported = [];
  const skipped = [];
  for (const item of candidates) {
    const [existing] = await sql`SELECT id FROM members WHERE deleted_at IS NULL
      AND lower(regexp_replace(street_address, '\\s+', ' ', 'g')) = ${normalizeAddress(item.address)} LIMIT 1`;
    if (existing) { skipped.push(item.address); continue; }
    const values = { h_number: `NY – ${item.address}`, cadastral_number: item.cadastralNumber, section_number: item.sectionNumber, street_address: item.address };
    const assignment = await findHamletForNewMember(values, { sql });
    const [member] = await sql`INSERT INTO members (h_number, cadastral_number, section_number, street_address, admin_comment, membership_status, hamlet_id, turufjell_as_sharing_opt_out, last_changed_by)
      VALUES (${values.h_number}, ${values.cadastral_number}, ${values.section_number}, ${values.street_address}, ${'Kartimport: Mangler H-nummer, kontaktperson og e-post.'}, 'member', ${assignment.hamlet?.id || null}, FALSE, ${user.email.toLowerCase()})
      RETURNING id, h_number, street_address`;
    await sql`INSERT INTO member_profile_updates (id, member_id, changed_fields, comment, last_changed_by)
      VALUES (${randomUUID().replaceAll('-', '')}, ${member.id}, ${['h_number', 'street_address', 'cadastral_number']}, ${TASK_COMMENT}, ${user.email.toLowerCase()})`;
    imported.push(member);
  }
  return { imported, skipped };
}
