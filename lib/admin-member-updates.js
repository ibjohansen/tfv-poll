import { getSql } from './db.js';
import { isMockMode } from './mock-store.js';
import { requirePermission } from './admin-access.js';
import { findHamletForNewMember } from './map/member-hamlet-assignment.js';

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

function sharingOptOut(value, fallback = null) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new Error('Invalid member');
  return value;
}

export async function updateAdminMember(id, input) {
  const user = await requirePermission('members');
  if (!/^\d+$/.test(id) || !input || typeof input !== 'object') throw new Error('Invalid member');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  const values = Object.fromEntries(editableTextFields.map((field) => [field, nullableText(input[field])]));
  const status = membershipStatus(input.membership_status);
  const optOut = sharingOptOut(input.turufjell_as_sharing_opt_out);
  const emails = Array.isArray(input.other_contact_emails) && input.other_contact_emails.every((email) => typeof email === 'string' && email.length <= 320)
    ? [...new Set(input.other_contact_emails.map((email) => email.trim()).filter(Boolean))]
    : null;
  if (!emails) throw new Error('Invalid member');
  const sql = getSql();
  const [member] = await sql`
    UPDATE members SET
      primary_contact_name = ${values.primary_contact_name},
      primary_contact_email = ${values.primary_contact_email}, other_contact_emails = ${emails},
      admin_comment = ${values.admin_comment}, membership_status = COALESCE(${status}, membership_status),
      turufjell_as_sharing_opt_out_updated_at = CASE
        WHEN ${optOut}::boolean IS NOT NULL AND turufjell_as_sharing_opt_out IS DISTINCT FROM ${optOut} THEN NOW()
        ELSE turufjell_as_sharing_opt_out_updated_at END,
      turufjell_as_sharing_opt_out = COALESCE(${optOut}, turufjell_as_sharing_opt_out), last_changed_by = ${user.email.toLowerCase()}
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id, h_number, cadastral_number, section_number, street_address, title_holder, registration_date,
      primary_contact_name, primary_contact_email, other_contact_emails, admin_comment, membership_status,
      turufjell_as_sharing_opt_out, turufjell_as_sharing_opt_out_updated_at
  `;
  if (!member) throw new Error('Member not found');
  return member;
}

export async function setAdminMemberAnnualFee(id, input) {
  const user = await requirePermission('members');
  const year = Number(input?.year);
  if (!/^\d+$/.test(String(id || '')) || !Number.isSafeInteger(year) || year < 1900 || year > 9999
    || typeof input?.paid !== 'boolean') throw new Error('Invalid annual fee');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  const sql = getSql();
  const [fee] = await sql`
    INSERT INTO member_annual_fees (member_id, fee_year, paid, last_changed_by)
    SELECT id, ${year}, ${input.paid}, ${user.email.toLowerCase()}
    FROM members WHERE id = ${id} AND deleted_at IS NULL
    ON CONFLICT (member_id, fee_year) DO UPDATE SET
      paid = EXCLUDED.paid, updated_at = NOW(), last_changed_by = EXCLUDED.last_changed_by
    RETURNING fee_year AS year, paid
  `;
  if (!fee) throw new Error('Member not found');
  return fee;
}

export async function createAdminMember(input) {
  const user = await requirePermission('members');
  if (!input || typeof input !== 'object') throw new Error('Invalid member');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  const values = Object.fromEntries(createTextFields.map((field) => [field, nullableText(input[field])]));
  const status = membershipStatus(input.membership_status, 'member');
  const optOut = sharingOptOut(input.turufjell_as_sharing_opt_out, false);
  if (!values.h_number) throw new Error('H-nummer is required');
  const emails = Array.isArray(input.other_contact_emails) && input.other_contact_emails.every((email) => typeof email === 'string' && email.length <= 320)
    ? [...new Set(input.other_contact_emails.map((email) => email.trim()).filter(Boolean))]
    : null;
  if (!emails) throw new Error('Invalid member');
  const sql = getSql();
  const hamletAssignment = await findHamletForNewMember(values, { sql });
  const hamletId = hamletAssignment.hamlet?.id || null;
  const [member] = await sql`
    INSERT INTO members (h_number, cadastral_number, section_number, street_address, primary_contact_name, primary_contact_email, other_contact_emails, admin_comment, membership_status, hamlet_id, turufjell_as_sharing_opt_out, turufjell_as_sharing_opt_out_updated_at, last_changed_by)
    VALUES (${values.h_number}, ${values.cadastral_number}, ${values.section_number}, ${values.street_address}, ${values.primary_contact_name}, ${values.primary_contact_email}, ${emails}, ${values.admin_comment}, ${status}, ${hamletId}, ${optOut}, ${optOut ? new Date().toISOString() : null}, ${user.email.toLowerCase()})
    RETURNING id, h_number, cadastral_number, section_number, street_address, title_holder, registration_date,
      primary_contact_name, primary_contact_email, other_contact_emails, admin_comment, membership_status, hamlet_id,
      turufjell_as_sharing_opt_out, turufjell_as_sharing_opt_out_updated_at
  `;
  return { ...member, hamlet_name: hamletAssignment.hamlet?.name || null, hamlet_assignment: hamletAssignment.status };
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
