import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { requirePermission } from './admin-access.js';
import { getSql } from './db.js';
import { isMockMode } from './mock-store.js';
import { uploadCmsObject, deleteCmsObject } from './cms-storage.js';
import { validateUploadedFile } from './upload-validation.js';
import { readAccountingReceipt } from './accounting-pdf.js';
import { AccountingError, accountingDate, accountingId, accountingVersion, accountingYear,
  normalizeExpense, normalizeExpenseBatch, normalizeYearSettings, proposeAccountingYear } from './accounting-validation.js';

const expenseFields = `id, year, batch_id, supplier, invoice_number, description, category,
  invoice_date::text, currency, amount_minor, exchange_rate_million, amount_ore,
  submitted_on::text, paid_on::text, notes, receipt_note, claimant_name, version`;
const attachmentFields = 'id, year, expense_id, original_filename, mime_type, size_bytes, suggestion, uploaded_by';
const uuid = () => randomUUID().replaceAll('-', '');

function expenseResult(row) {
  return { ...row, amount_minor: Number(row.amount_minor), exchange_rate_million: Number(row.exchange_rate_million), amount_ore: Number(row.amount_ore) };
}
function yearResult(row) { return { ...row, annual_fee_ore: Number(row.annual_fee_ore) }; }
function fileResult(row) { return { ...row, url: `/api/admin/accounting/files/${row.id}` }; }

async function requireWrite() {
  const user = await requirePermission('members');
  if (isMockMode()) throw new AccountingError('mock', 409);
  return { actor: user.email.toLowerCase(), name: (user.name?.trim() || user.email).slice(0, 320) };
}

export async function getAccountingOverview(value) {
  await requirePermission('read');
  const year = accountingYear(value);
  if (isMockMode()) return { year, settings: proposeAccountingYear(year, 8), years: [], memberCount: 8, exemptMemberCount: 0, paidMemberCount: 0,
    invoicedMemberCount: 0, collectionCandidateCount: 0, expenses: [], attachments: [] };
  const sql = getSql();
  const [settings, previous, years, counts, expenses, files] = await Promise.all([
    sql`SELECT id, annual_fee_ore, member_count, budget, actual_income, version FROM accounting_years WHERE id = ${year}`,
    sql`SELECT id, annual_fee_ore, member_count, budget, actual_income, version FROM accounting_years WHERE id < ${year} ORDER BY id DESC LIMIT 1`,
    sql`SELECT id FROM accounting_years ORDER BY id DESC`,
    sql`SELECT COUNT(*) FILTER (WHERE m.membership_status = 'member')::int AS members,
      COUNT(*) FILTER (WHERE m.membership_status = 'exempt')::int AS exempt_members,
      COUNT(*) FILTER (WHERE m.membership_status = 'member' AND f.paid = TRUE)::int AS paid,
      COUNT(*) FILTER (WHERE m.membership_status = 'member' AND f.invoiced_on IS NOT NULL)::int AS invoiced,
      COUNT(*) FILTER (WHERE m.membership_status = 'member' AND f.invoiced_on IS NOT NULL AND f.paid = FALSE)::int AS collection_candidates
      FROM members m LEFT JOIN member_annual_fees f ON f.member_id = m.id AND f.fee_year = ${year}
      WHERE m.deleted_at IS NULL`,
    sql.query(`SELECT ${expenseFields} FROM accounting_expenses WHERE year = $1 ORDER BY invoice_date DESC, created_at DESC, id`, [year]),
    sql.query(`SELECT ${attachmentFields} FROM accounting_attachments WHERE year = $1 ORDER BY created_at, id`, [year]),
  ]);
  return { year, settings: settings[0] ? yearResult(settings[0]) : proposeAccountingYear(year, counts[0].members, previous[0] ? yearResult(previous[0]) : null),
    years: years.map((row) => row.id), memberCount: counts[0].members, exemptMemberCount: counts[0].exempt_members, paidMemberCount: counts[0].paid,
    invoicedMemberCount: counts[0].invoiced, collectionCandidateCount: counts[0].collection_candidates,
    expenses: expenses.map(expenseResult), attachments: files.map(fileResult) };
}

export async function saveAccountingYear(input) {
  const { actor } = await requireWrite();
  const values = normalizeYearSettings(input);
  const sql = getSql();
  const { year, annual_fee_ore, member_count, budget, actual_income, version } = values;
  const [saved] = version === 0
    ? await sql`INSERT INTO accounting_years (id, annual_fee_ore, member_count, budget, actual_income, last_changed_by)
        VALUES (${year}, ${annual_fee_ore}, ${member_count}, ${JSON.stringify(budget)}::jsonb, ${JSON.stringify(actual_income)}::jsonb, ${actor})
        ON CONFLICT (id) DO NOTHING RETURNING id, version`
    : await sql`UPDATE accounting_years SET annual_fee_ore = ${annual_fee_ore}, member_count = ${member_count},
        budget = ${JSON.stringify(budget)}::jsonb, actual_income = ${JSON.stringify(actual_income)}::jsonb,
        version = version + 1, updated_at = NOW(), last_changed_by = ${actor}
        WHERE id = ${year} AND version = ${version} RETURNING id, version`;
  if (!saved) throw new AccountingError('conflict', 409);
  return saved;
}

export async function uploadAccountingReceipt(value, file) {
  const { actor, name } = await requireWrite();
  const year = accountingYear(value);
  if (!file || !/\.(pdf|jpe?g|png|webp)$/i.test(file.name || '') || file.size > 3 * 1024 * 1024) throw new AccountingError('invalidFile');
  const validated = await validateUploadedFile(file);
  const sha256 = createHash('sha256').update(validated.bytes).digest('hex');
  const sql = getSql();
  const [settings] = await sql`SELECT id FROM accounting_years WHERE id = ${year}`;
  if (!settings) throw new AccountingError('saveYearFirst', 409);
  const existing = await sql.query(`SELECT ${attachmentFields} FROM accounting_attachments WHERE sha256 = $1`, [sha256]);
  if (existing[0]) {
    if (existing[0].year === year && !existing[0].expense_id) return fileResult(existing[0]);
    throw new AccountingError('duplicateReceipt', 409);
  }
  const suggestion = await readAccountingReceipt(validated);
  const id = uuid();
  const key = `accounting/${year}/${id}.${validated.extension}`;
  await uploadCmsObject(key, validated.bytes, validated.mimeType);
  try {
    const [saved] = await sql`INSERT INTO accounting_attachments
      (id, year, original_filename, storage_key, mime_type, size_bytes, sha256, suggestion, last_changed_by, uploaded_by)
      VALUES (${id}, ${year}, ${validated.filename}, ${key}, ${validated.mimeType}, ${validated.size},
        ${sha256}, ${JSON.stringify(suggestion)}::jsonb, ${actor}, ${name})
      RETURNING id, year, expense_id, original_filename, mime_type, size_bytes, suggestion, uploaded_by`;
    return fileResult(saved);
  } catch (error) {
    // Only remove this newly uploaded object for a definite rejected INSERT.
    // A lost response might hide a successful commit, so retain it on ambiguity.
    if (['23505', '23503', '23514'].includes(error.code || error.cause?.code)) await deleteCmsObject(key).catch(() => {});
    throw error;
  }
}

export async function createAccountingExpenses(value, input) {
  const { actor } = await requireWrite();
  const year = accountingYear(value);
  const entries = normalizeExpenseBatch(input.entries, year);
  const batch = accountingId(input.batch_id);
  const sql = getSql();
  const results = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(62719, ${year})`,
    sql`WITH input AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(entries)}::jsonb) AS x(
        id text, supplier text, invoice_number text, description text, category text, invoice_date date,
        currency text, amount_minor bigint, exchange_rate_million bigint, submitted_on date, paid_on date,
        notes text, receipt_note text, attachment_ids text[], claimant_name text)
    ), inserted AS (
      INSERT INTO accounting_expenses (id, year, batch_id, supplier, invoice_number, description, category,
        invoice_date, currency, amount_minor, exchange_rate_million, submitted_on, paid_on, notes, receipt_note, claimant_name, last_changed_by)
      SELECT id, ${year}, ${batch}, supplier, invoice_number, description, category, invoice_date, currency,
        amount_minor, exchange_rate_million, submitted_on, paid_on, notes, receipt_note, claimant_name, ${actor} FROM input
      WHERE EXISTS (SELECT 1 FROM accounting_years WHERE id = ${year})
        AND NOT EXISTS (
          SELECT 1 FROM input i CROSS JOIN LATERAL unnest(i.attachment_ids) a(id)
          LEFT JOIN accounting_attachments f ON f.id = a.id AND f.year = ${year} AND f.expense_id IS NULL
          WHERE f.id IS NULL
        )
      RETURNING id, version
    ), linked AS (
      UPDATE accounting_attachments f SET expense_id = i.id, last_changed_by = ${actor}
      FROM input i JOIN inserted s ON s.id = i.id WHERE f.id = ANY(i.attachment_ids)
      RETURNING f.id
    ) SELECT id, version FROM inserted`,
  ]);
  if (results[1].length !== entries.length) throw new AccountingError('conflict', 409);
  return results[1];
}

export async function updateAccountingExpense(value, input) {
  const { actor } = await requireWrite();
  const year = accountingYear(value);
  const e = normalizeExpense(input, year);
  const version = accountingVersion(input.version);
  const sql = getSql();
  const results = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(62719, ${year})`,
    sql`WITH updated AS (
      UPDATE accounting_expenses SET supplier = ${e.supplier}, invoice_number = ${e.invoice_number},
        description = ${e.description}, category = ${e.category}, invoice_date = ${e.invoice_date}::date,
        currency = ${e.currency}, amount_minor = ${e.amount_minor}, exchange_rate_million = ${e.exchange_rate_million},
        submitted_on = ${e.submitted_on}::date, paid_on = ${e.paid_on}::date, notes = ${e.notes}, receipt_note = ${e.receipt_note},
        claimant_name = COALESCE(${input.claimant_name === undefined ? null : e.claimant_name}::text, claimant_name),
        version = version + 1, updated_at = NOW(), last_changed_by = ${actor}
      WHERE id = ${e.id} AND year = ${year} AND version = ${version}
        AND (paid_on IS NULL OR (supplier = ${e.supplier} AND invoice_number = ${e.invoice_number}
          AND invoice_date = ${e.invoice_date}::date AND category = ${e.category} AND currency = ${e.currency}
          AND amount_minor = ${e.amount_minor} AND exchange_rate_million = ${e.exchange_rate_million}))
        AND NOT EXISTS (SELECT 1 FROM unnest(${e.attachment_ids}::text[]) a(id)
          LEFT JOIN accounting_attachments f ON f.id = a.id AND f.year = ${year} AND (f.expense_id IS NULL OR f.expense_id = ${e.id})
          WHERE f.id IS NULL)
        AND NOT EXISTS (SELECT 1 FROM accounting_attachments WHERE expense_id = ${e.id} AND NOT (id = ANY(${e.attachment_ids}::text[])))
      RETURNING id, version
    ), linked AS (
      UPDATE accounting_attachments SET expense_id = ${e.id}, last_changed_by = ${actor}
      WHERE id = ANY(${e.attachment_ids}::text[]) AND expense_id IS NULL AND EXISTS (SELECT 1 FROM updated)
      RETURNING id
    ) SELECT id, version FROM updated`,
  ]);
  if (!results[1][0]) throw new AccountingError('expenseConflict', 409);
  return results[1][0];
}

export async function updateAccountingStatuses(value, input) {
  const { actor } = await requireWrite();
  const year = accountingYear(value);
  const date = accountingDate(input.date);
  if (!['submit', 'pay'].includes(input.action) || !Array.isArray(input.entries) || !input.entries.length || input.entries.length > 100) throw new AccountingError('invalidInput');
  const entries = input.entries.map((entry) => ({ id: accountingId(entry.id), version: accountingVersion(entry.version) }));
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) throw new AccountingError('invalidInput');
  const sql = getSql();
  const results = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(62719, ${year})`,
    sql`WITH input AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(entries)}::jsonb) AS x(id text, version integer)),
      eligible AS (SELECT e.id FROM accounting_expenses e JOIN input i ON i.id = e.id AND i.version = e.version
        WHERE e.year = ${year} AND e.paid_on IS NULL
          AND (${input.action} = 'submit' OR e.submitted_on IS NULL OR e.submitted_on <= ${date}::date))
      UPDATE accounting_expenses SET
        submitted_on = CASE WHEN ${input.action} IN ('submit', 'pay') THEN COALESCE(submitted_on, ${date}::date) ELSE submitted_on END,
        paid_on = CASE WHEN ${input.action} = 'pay' THEN ${date}::date ELSE paid_on END,
        version = version + 1, updated_at = NOW(), last_changed_by = ${actor}
      WHERE id IN (SELECT id FROM eligible) AND (SELECT COUNT(*) FROM eligible) = ${entries.length}
      RETURNING id, version`,
  ]);
  if (results[1].length !== entries.length) throw new AccountingError('statusConflict', 409);
  return results[1];
}

export async function getAccountingAttachment(value) {
  await requirePermission('read');
  const id = accountingId(value);
  if (isMockMode()) throw new AccountingError('missingFile', 404);
  const [file] = await getSql()`SELECT original_filename, mime_type, size_bytes, storage_key FROM accounting_attachments WHERE id = ${id}`;
  if (!file) throw new AccountingError('missingFile', 404);
  return file;
}
