import { getSql } from './db.js';
import { isMockMode } from './mock-store.js';
import { requirePermission } from './admin-access.js';

const editableTextFields = ['primary_contact_name', 'primary_contact_email', 'admin_comment'];
const createTextFields = ['h_number', 'cadastral_number', 'section_number', 'street_address', ...editableTextFields];

function nullableText(value, maxLength = 500) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > maxLength) throw new Error('Invalid member');
  return value.trim() || null;
}

function membershipStatus(value, fallback = null) {
  if (value === undefined) return fallback;
  if (!['member', 'exempt'].includes(value)) throw new Error('Invalid member');
  return value;
}

export async function updateAdminMember(id, input) {
  const user = await requirePermission('members');
  if (!/^\d+$/.test(id) || !input || typeof input !== 'object') throw new Error('Invalid member');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  const values = Object.fromEntries(editableTextFields.map((field) => [field, nullableText(input[field])]));
  const status = membershipStatus(input.membership_status);
  const emails = Array.isArray(input.other_contact_emails) && input.other_contact_emails.every((email) => typeof email === 'string' && email.length <= 320)
    ? [...new Set(input.other_contact_emails.map((email) => email.trim()).filter(Boolean))]
    : null;
  if (!emails) throw new Error('Invalid member');
  const sql = getSql();
  const [member] = await sql`
    UPDATE members SET
      primary_contact_name = ${values.primary_contact_name},
      primary_contact_email = ${values.primary_contact_email}, other_contact_emails = ${emails},
      admin_comment = ${values.admin_comment}, membership_status = COALESCE(${status}, membership_status), last_changed_by = ${user.email.toLowerCase()}
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id, h_number, cadastral_number, section_number, street_address, title_holder, registration_date,
      primary_contact_name, primary_contact_email, other_contact_emails, admin_comment, membership_status
  `;
  if (!member) throw new Error('Member not found');
  return member;
}

export async function createAdminMember(input) {
  const user = await requirePermission('members');
  if (!input || typeof input !== 'object') throw new Error('Invalid member');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  const values = Object.fromEntries(createTextFields.map((field) => [field, nullableText(input[field])]));
  const status = membershipStatus(input.membership_status, 'member');
  if (!values.h_number) throw new Error('H-nummer is required');
  const emails = Array.isArray(input.other_contact_emails) && input.other_contact_emails.every((email) => typeof email === 'string' && email.length <= 320)
    ? [...new Set(input.other_contact_emails.map((email) => email.trim()).filter(Boolean))]
    : null;
  if (!emails) throw new Error('Invalid member');
  const sql = getSql();
  const [member] = await sql`
    INSERT INTO members (h_number, cadastral_number, section_number, street_address, primary_contact_name, primary_contact_email, other_contact_emails, admin_comment, membership_status, last_changed_by)
    VALUES (${values.h_number}, ${values.cadastral_number}, ${values.section_number}, ${values.street_address}, ${values.primary_contact_name}, ${values.primary_contact_email}, ${emails}, ${values.admin_comment}, ${status}, ${user.email.toLowerCase()})
    RETURNING id, h_number, cadastral_number, section_number, street_address, title_holder, registration_date,
      primary_contact_name, primary_contact_email, other_contact_emails, admin_comment, membership_status
  `;
  return member;
}

export async function deleteAdminMember(id) {
  const user = await requirePermission('members');
  if (!/^\d+$/.test(id)) throw new Error('Invalid member');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  const sql = getSql();
  const [member] = await sql`
    WITH deleted_member AS (
      UPDATE members SET deleted_at = NOW(), last_changed_by = ${user.email.toLowerCase()}
      WHERE id = ${id} AND deleted_at IS NULL RETURNING id
    ), revoked_member_tokens AS (
      UPDATE member_access_tokens SET revoked_at = NOW()
      WHERE member_id IN (SELECT id FROM deleted_member) AND revoked_at IS NULL RETURNING id
    ), revoked_member_sessions AS (
      UPDATE member_sessions SET revoked_at = NOW()
      WHERE member_id IN (SELECT id FROM deleted_member) AND revoked_at IS NULL RETURNING id
    ), revoked_survey_tokens AS (
      UPDATE survey_access_tokens SET revoked_at = NOW()
      WHERE member_id IN (SELECT id FROM deleted_member) AND revoked_at IS NULL RETURNING id
    ), revoked_survey_sessions AS (
      UPDATE survey_sessions SET revoked_at = NOW()
      WHERE member_id IN (SELECT id FROM deleted_member) AND revoked_at IS NULL RETURNING id
    )
    SELECT id FROM deleted_member
  `;
  if (!member) throw new Error('Member not found');
}
