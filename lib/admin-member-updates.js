import { getSql } from './db.js';
import { isMockMode } from './mock-store.js';
import { requireAdmin } from './admin-access.js';

const editableTextFields = ['primary_contact_name', 'primary_contact_email', 'admin_comment'];
const createTextFields = ['h_number', 'cadastral_number', 'section_number', 'street_address', ...editableTextFields];

function nullableText(value, maxLength = 500) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > maxLength) throw new Error('Invalid member');
  return value.trim() || null;
}

export async function updateAdminMember(id, input) {
  await requireAdmin();
  if (!/^\d+$/.test(id) || !input || typeof input !== 'object') throw new Error('Invalid member');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  const values = Object.fromEntries(editableTextFields.map((field) => [field, nullableText(input[field])]));
  const emails = Array.isArray(input.other_contact_emails) && input.other_contact_emails.every((email) => typeof email === 'string' && email.length <= 320)
    ? [...new Set(input.other_contact_emails.map((email) => email.trim()).filter(Boolean))]
    : null;
  if (!emails) throw new Error('Invalid member');
  const sql = getSql();
  const [member] = await sql`
    UPDATE members SET
      primary_contact_name = ${values.primary_contact_name},
      primary_contact_email = ${values.primary_contact_email}, other_contact_emails = ${emails}, admin_comment = ${values.admin_comment}
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id, h_number, cadastral_number, section_number, street_address, title_holder, registration_date,
      primary_contact_name, primary_contact_email, other_contact_emails, admin_comment
  `;
  if (!member) throw new Error('Member not found');
  return member;
}

export async function createAdminMember(input) {
  await requireAdmin();
  if (!input || typeof input !== 'object') throw new Error('Invalid member');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  const values = Object.fromEntries(createTextFields.map((field) => [field, nullableText(input[field])]));
  if (!values.h_number) throw new Error('H-nummer is required');
  const emails = Array.isArray(input.other_contact_emails) && input.other_contact_emails.every((email) => typeof email === 'string' && email.length <= 320)
    ? [...new Set(input.other_contact_emails.map((email) => email.trim()).filter(Boolean))]
    : null;
  if (!emails) throw new Error('Invalid member');
  const sql = getSql();
  const [member] = await sql`
    INSERT INTO members (h_number, cadastral_number, section_number, street_address, primary_contact_name, primary_contact_email, other_contact_emails, admin_comment)
    VALUES (${values.h_number}, ${values.cadastral_number}, ${values.section_number}, ${values.street_address}, ${values.primary_contact_name}, ${values.primary_contact_email}, ${emails}, ${values.admin_comment})
    RETURNING id, access_token, h_number, cadastral_number, section_number, street_address, title_holder, registration_date,
      primary_contact_name, primary_contact_email, other_contact_emails, admin_comment
  `;
  return member;
}

export async function deleteAdminMember(id) {
  await requireAdmin();
  if (!/^\d+$/.test(id)) throw new Error('Invalid member');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  const sql = getSql();
  const [member] = await sql`UPDATE members SET deleted_at = NOW(), access_revoked_at = NOW() WHERE id = ${id} AND deleted_at IS NULL RETURNING id`;
  if (!member) throw new Error('Member not found');
}
