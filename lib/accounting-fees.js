import 'server-only';
import { randomUUID } from 'node:crypto';
import { requirePermission } from './admin-access.js';
import { getSql } from './db.js';
import { isMockMode } from './mock-store.js';
import { AccountingError, accountingDate, accountingYear } from './accounting-validation.js';
import { collectionCandidatesCsv, parseFeeStatusCsv } from './accounting-fee-files.js';

function validCsv(file) {
  return file && typeof file.name === 'string' && /\.csv$/i.test(file.name) && file.size > 0 && file.size <= 1024 * 1024;
}

export async function importAnnualFeeStatuses(input) {
  const user = await requirePermission('members');
  if (isMockMode()) throw new AccountingError('mock', 409);
  const year = accountingYear(input.year);
  const kind = input.kind;
  const apply = input.apply === true;
  if (!['invoiced', 'paid'].includes(kind) || !validCsv(input.file)) throw new AccountingError('invalidFeeImport');
  const date = kind === 'invoiced' ? accountingDate(input.date) : null;
  if (date && Number(date.slice(0, 4)) !== year) throw new AccountingError('wrongYear');
  const identifiers = parseFeeStatusCsv(await input.file.text());
  const ids = identifiers.filter((item) => item.type === 'member_id').map((item) => item.value);
  const hNumbers = identifiers.filter((item) => item.type === 'h_number').map((item) => item.value.toLocaleLowerCase('nb-NO'));
  const sql = getSql();
  const members = await sql`SELECT id::text AS id, h_number FROM members
    WHERE deleted_at IS NULL AND membership_status = 'member'
      AND (id = ANY(${ids}::bigint[]) OR lower(h_number) = ANY(${hNumbers}::text[]))`;
  const byId = new Map(members.map((member) => [member.id, member]));
  const byHNumber = new Map(members.map((member) => [member.h_number.toLocaleLowerCase('nb-NO'), member]));
  const matched = [], unmatched = [];
  for (const identifier of identifiers) {
    const member = identifier.type === 'member_id' ? byId.get(identifier.value) : byHNumber.get(identifier.value.toLocaleLowerCase('nb-NO'));
    if (member) matched.push(member); else unmatched.push(identifier.value);
  }
  if (new Set(matched.map((member) => member.id)).size !== matched.length) throw new AccountingError('duplicateFeeImport');
  const preview = { rowCount: identifiers.length, matchedCount: matched.length, unmatchedCount: unmatched.length, unmatched: unmatched.slice(0, 20) };
  if (!apply) return { applied: false, preview };
  if (unmatched.length) throw new AccountingError('feeImportUnmatched', 409);
  const matchedIds = matched.map((member) => member.id);
  const actor = user.email.toLowerCase();
  if (kind === 'invoiced') {
    await sql`INSERT INTO member_annual_fees (member_id, fee_year, paid, invoiced_on, last_changed_by)
      SELECT id, ${year}, FALSE, ${date}::date, ${actor} FROM members WHERE id = ANY(${matchedIds}::bigint[])
      ON CONFLICT (member_id, fee_year) DO UPDATE SET invoiced_on = EXCLUDED.invoiced_on,
        updated_at = NOW(), last_changed_by = EXCLUDED.last_changed_by`;
  } else {
    await sql`INSERT INTO member_annual_fees (member_id, fee_year, paid, last_changed_by)
      SELECT id, ${year}, TRUE, ${actor} FROM members WHERE id = ANY(${matchedIds}::bigint[])
      ON CONFLICT (member_id, fee_year) DO UPDATE SET paid = TRUE,
        updated_at = NOW(), last_changed_by = EXCLUDED.last_changed_by`;
  }
  return { applied: true, preview };
}

export async function createCollectionCandidatesExport(yearValue, t) {
  const user = await requirePermission('members');
  if (isMockMode()) throw new AccountingError('mock', 409);
  const year = accountingYear(yearValue);
  const sql = getSql();
  const [settings] = await sql`SELECT annual_fee_ore FROM accounting_years WHERE id = ${year}`;
  if (!settings) throw new AccountingError('saveYearFirst', 409);
  const members = await sql`SELECT m.id::text AS id, m.h_number, m.cadastral_number, m.section_number, m.street_address,
      m.title_holder, m.primary_contact_name, m.primary_contact_email, m.other_contact_emails, f.invoiced_on::text
    FROM member_annual_fees f JOIN members m ON m.id = f.member_id
    WHERE f.fee_year = ${year} AND f.invoiced_on IS NOT NULL AND f.paid = FALSE
      AND m.deleted_at IS NULL AND m.membership_status = 'member'
    ORDER BY CASE WHEN m.h_number ~ '^\d+$' THEN m.h_number::bigint END NULLS LAST, m.h_number, m.id`;
  await sql`INSERT INTO audit_log (table_name, row_id, operation, changed_by, after_value)
    VALUES ('admin_actions', ${randomUUID()}, 'INSERT', ${user.email.toLowerCase()},
      ${JSON.stringify({ action: 'collection_candidates_export', year, count: members.length })}::jsonb)`;
  return { csv: collectionCandidatesCsv({ year, annualFeeOre: Number(settings.annual_fee_ore), members }, t), count: members.length, year };
}
