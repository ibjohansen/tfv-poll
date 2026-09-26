import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { loadModule, plain } from './helpers/load-module.mjs';
import * as validation from '../lib/accounting-validation.js';
import * as upload from '../lib/upload-validation.js';
import * as feeFiles from '../lib/accounting-fee-files.js';
import { accountingStatements, verifyAccountingSchema } from '../scripts/release-accounting-schema.mjs';

// Ephemeral local PostgreSQL/WASM; never connects to Neon or reads .env.local.
const db = new PGlite({ extensions: { pg_trgm } });
function query(text, values = []) {
  let promise;
  return { text, values, then(resolve, reject) {
    promise ??= db.query(text, values).then((result) => result.rows);
    return promise.then(resolve, reject);
  } };
}
function sql(strings, ...values) { return query(strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, ''), values); }
sql.query = query;
sql.transaction = (queries) => db.transaction(async (transaction) => {
  const results = [];
  for (const statement of queries) results.push((await transaction.query(statement.text, statement.values)).rows);
  return results;
});
let api, feeApi, schema, denied = false;
const storage = new Map();
const uuid = () => crypto.randomUUID().replaceAll('-', '');
const yearInput = (year) => ({ year, version: 0, annual_fee: '250', member_count: 411,
  budget: { fees: '0', reminders: '0', board: '53000', systems: '5000', accountant: '5000', trailer: '8000', other: '20000', bank: '2000' },
  actual_income: { dues: '', fees: '0', reminders: '0' } });
const expense = (values = {}) => ({ id: uuid(), supplier: 'Synthetic supplier', invoice_number: uuid(), description: 'Subscription',
  category: 'systems', invoice_date: '2026-09-12', amount: '16.25', currency: 'USD', exchange_rate: '10.123456',
  submitted_on: '', paid_on: '', notes: '', receipt_note: 'Synthetic test', attachment_ids: [], reviewed: true, ...values });
const pdf = (text = uuid()) => new File([`%PDF-1.7\n${text}`], 'synthetic.pdf', { type: 'application/pdf' });

before(async () => {
  schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
  await db.exec(schema);
  api = await loadModule('lib/accounting.js', {
    'node:crypto': crypto, './db.js': { getSql: () => sql }, './mock-store.js': { isMockMode: () => false },
    './admin-access.js': { requirePermission: async (permission) => { if (denied && permission !== 'read') throw new Error('Forbidden'); return { name: 'Test Bruker', email: 'accountant@example.test' }; } },
    './cms-storage.js': { uploadCmsObject: async (key, bytes) => { storage.set(key, bytes); }, deleteCmsObject: async (key) => { storage.delete(key); } },
    './upload-validation.js': upload, './accounting-validation.js': validation,
    './accounting-pdf.js': { readAccountingReceipt: async () => ({ amount: '16.25', currency: 'USD' }) },
  });
  feeApi = await loadModule('lib/accounting-fees.js', {
    'node:crypto': crypto, './db.js': { getSql: () => sql }, './mock-store.js': { isMockMode: () => false },
    './admin-access.js': { requirePermission: async () => ({ email: 'accountant@example.test' }) },
    './accounting-validation.js': validation, './accounting-fee-files.js': feeFiles,
  });
  await api.saveAccountingYear(yearInput(2026));
  await api.saveAccountingYear(yearInput(2027));
});
after(async () => db.close());

test('full schema can be reapplied without changing accounting snapshots', async () => {
  await db.exec(schema);
  const result = await api.getAccountingOverview(2026);
  assert.equal(result.settings.version, 1); assert.equal(result.settings.budget.dues, 10275000);
  await assert.rejects(api.saveAccountingYear(yearInput(2026)), /conflict/);
});

test('accounting-only migration adds claimant fields to existing receipts without inventing names or changing old data', async () => {
  const legacy = new PGlite({ extensions: { pg_trgm } });
  try {
    const beforeFeature = schema.replace(/^ALTER TABLE accounting_(?:expenses ADD COLUMN IF NOT EXISTS claimant_name|attachments ADD COLUMN IF NOT EXISTS uploaded_by).*;\n/gm, '');
    await legacy.exec(beforeFeature);
    await legacy.exec(`INSERT INTO accounting_years (id, annual_fee_ore, member_count, budget, actual_income) VALUES (2026, 25000, 1, '{}', '{}');
      INSERT INTO accounting_expenses (id, year, batch_id, supplier, description, category, invoice_date, currency, amount_minor, exchange_rate_million)
      VALUES ('${'1'.repeat(32)}', 2026, '${'2'.repeat(32)}', 'Test', 'Older cost', 'other', '2026-01-01', 'NOK', 10000, 1000000);
      INSERT INTO accounting_attachments (id, year, expense_id, original_filename, storage_key, mime_type, size_bytes, sha256)
      VALUES ('${'3'.repeat(32)}', 2026, '${'1'.repeat(32)}', 'old.pdf', 'synthetic/key', 'application/pdf', 10, '${'4'.repeat(64)}');`);
    const oldCosts = (await legacy.query('SELECT * FROM accounting_expenses')).rows;
    const oldFiles = (await legacy.query('SELECT * FROM accounting_attachments')).rows;
    const auditCount = (await legacy.query('SELECT count(*)::int AS n FROM audit_log')).rows[0].n;
    const statements = accountingStatements(schema);
    assert.equal(statements.length, 23);
    for (let repeat = 0; repeat < 2; repeat++) {
      await legacy.transaction(async (transaction) => { for (const statement of statements) await transaction.exec(statement); });
      await verifyAccountingSchema(legacy);
    }
    const { claimant_name, ...cost } = (await legacy.query('SELECT * FROM accounting_expenses')).rows[0];
    const { uploaded_by, ...file } = (await legacy.query('SELECT * FROM accounting_attachments')).rows[0];
    assert.equal(claimant_name, ''); assert.equal(uploaded_by, '');
    assert.deepEqual(cost, oldCosts[0]); assert.deepEqual(file, oldFiles[0]);
    assert.equal((await legacy.query('SELECT count(*)::int AS n FROM audit_log')).rows[0].n, auditCount);
  } finally { await legacy.close(); }
});

test('receipt batch commits atomically, records audit actors and preserves exact NOK amounts', async () => {
  const firstFile = await api.uploadAccountingReceipt(2026, pdf());
  const secondFile = await api.uploadAccountingReceipt(2026, pdf());
  const first = expense({ attachment_ids: [firstFile.id] });
  const second = expense({ attachment_ids: [secondFile.id], amount: '10.00' });
  const saved = await api.createAccountingExpenses(2026, { batch_id: uuid(), entries: [first, second] });
  assert.equal(saved.length, 2);
  const current = await api.getAccountingOverview(2026);
  assert.equal(current.expenses.find((row) => row.id === first.id).amount_ore, 16451);
  assert.equal(current.attachments.find((row) => row.id === firstFile.id).expense_id, first.id);
  const audit = await sql`SELECT changed_by, after_value FROM audit_log WHERE table_name = 'accounting_attachments' AND row_id = ${firstFile.id}`;
  assert.equal(audit.length, 2);
  assert.ok(audit.every((row) => row.changed_by === 'accountant@example.test' && !('storage_key' in row.after_value)));
  await assert.rejects(api.createAccountingExpenses(2026, { batch_id: uuid(), entries: [expense(), expense({ attachment_ids: [firstFile.id] })] }), /conflict/);
  assert.equal((await api.getAccountingOverview(2026)).expenses.length, current.expenses.length);
});

test('duplicate invoice numbers roll back the whole batch and uploading identical data preserves existing receipts', async () => {
  const file = pdf();
  const uploaded = await api.uploadAccountingReceipt(2026, file);
  assert.equal((await api.uploadAccountingReceipt(2026, file)).id, uploaded.id);
  const invoice = uuid();
  await assert.rejects(api.createAccountingExpenses(2026, { batch_id: uuid(), entries: [expense({ invoice_number: invoice }), expense({ invoice_number: invoice })] }), (error) => error.code === '23505');
  assert.equal((await sql`SELECT id FROM accounting_expenses WHERE invoice_number = ${invoice}`).length, 0);
  await api.createAccountingExpenses(2026, { batch_id: uuid(), entries: [expense({ attachment_ids: [uploaded.id] })] });
  await assert.rejects(api.uploadAccountingReceipt(2026, file), /duplicateReceipt/);
  await assert.rejects(api.uploadAccountingReceipt(2027, file), /duplicateReceipt/);
});

test('claimant names survive batches, edits, status changes and reload while upload identity and audit actors remain separate', async () => {
  const file = pdf();
  const uploaded = await api.uploadAccountingReceipt(2026, file);
  assert.equal(uploaded.uploaded_by, 'Test Bruker');
  const first = expense({ claimant_name: '  Kari Test  ', attachment_ids: [uploaded.id] });
  const second = expense({ claimant_name: 'Per Test' });
  const saved = await api.createAccountingExpenses(2026, { batch_id: uuid(), entries: [first, second] });
  const record = () => api.getAccountingOverview(2026).then((data) => data.expenses.find((entry) => entry.id === first.id));
  assert.equal((await record()).claimant_name, 'Kari Test');
  const updated = await api.updateAccountingExpense(2026, { ...first, version: saved.find((entry) => entry.id === first.id).version, claimant_name: 'Ola Test' });
  assert.equal((await record()).claimant_name, 'Ola Test');
  // An old client omitting the new field must not clear a previously saved name.
  const { claimant_name: unused, ...legacyInput } = first;
  void unused;
  const legacyUpdate = await api.updateAccountingExpense(2026, { ...legacyInput, version: updated.version });
  await api.updateAccountingStatuses(2026, { entries: [legacyUpdate], action: 'pay', date: '2026-09-25' });
  assert.equal((await record()).claimant_name, 'Ola Test');
  const current = await api.getAccountingOverview(2026);
  assert.equal(current.expenses.find((entry) => entry.id === second.id).claimant_name, 'Per Test');
  assert.equal(current.attachments.find((entry) => entry.id === uploaded.id).uploaded_by, 'Test Bruker');
  const audit = await sql`SELECT changed_by, after_value FROM audit_log WHERE table_name = 'accounting_expenses' AND row_id = ${first.id} ORDER BY id`;
  assert.equal(audit[0].after_value.claimant_name, 'Kari Test');
  assert.equal(audit[1].after_value.claimant_name, 'Ola Test');
  assert.ok(audit.every((entry) => entry.changed_by === 'accountant@example.test'));
});

test('a receipt from another year cannot be attached and manual entries require an explanation', async () => {
  const file = await api.uploadAccountingReceipt(2027, pdf());
  await assert.rejects(api.createAccountingExpenses(2026, { batch_id: uuid(), entries: [expense({ attachment_ids: [file.id] })] }), /conflict/);
  await assert.rejects(api.createAccountingExpenses(2026, { batch_id: uuid(), entries: [expense({ receipt_note: '' })] }), /receiptRequired/);
});

test('direct payment records submission, stale batch updates are atomic, and paid amounts are protected', async () => {
  const direct = expense();
  const [directCreated] = await api.createAccountingExpenses(2026, { batch_id: uuid(), entries: [direct] });
  const [directPaid] = await api.updateAccountingStatuses(2026, { entries: [directCreated], action: 'pay', date: '2026-09-20' });
  const directRow = (await api.getAccountingOverview(2026)).expenses.find((entry) => entry.id === direct.id);
  assert.equal(directPaid.version, directCreated.version + 1); assert.equal(directRow.submitted_on, '2026-09-20'); assert.equal(directRow.paid_on, '2026-09-20');
  const a = expense(), b = expense();
  const entries = await api.createAccountingExpenses(2026, { batch_id: uuid(), entries: [a, b] });
  const submitted = await api.updateAccountingStatuses(2026, { entries, action: 'submit', date: '2026-09-18' });
  await assert.rejects(api.updateAccountingStatuses(2026, { entries: [entries.find((entry) => entry.id === a.id), submitted.find((entry) => entry.id === b.id)], action: 'pay', date: '2026-09-20' }), /statusConflict/);
  assert.ok((await sql`SELECT paid_on FROM accounting_expenses WHERE id = ANY(${[a.id, b.id]}::text[])`).every((row) => row.paid_on === null));
  const paid = await api.updateAccountingStatuses(2026, { entries: submitted, action: 'pay', date: '2026-09-20' });
  const paidVersion = paid.find((entry) => entry.id === a.id).version;
  await assert.rejects(api.updateAccountingExpense(2026, { ...a, version: paidVersion, amount: '100', submitted_on: '2026-09-18', paid_on: '2026-09-20' }), /expenseConflict/);
  const corrected = await api.updateAccountingExpense(2026, { ...a, version: paidVersion, submitted_on: '2026-09-18', paid_on: '' });
  await api.updateAccountingExpense(2026, { ...a, version: corrected.version, amount: '20', submitted_on: '2026-09-18' });
  assert.equal((await api.getAccountingOverview(2026)).expenses.find((entry) => entry.id === a.id).amount_ore, 20247);
});

test('annual-fee imports preview exact matches, mark invoices and payments, and feed collection export', async () => {
  const [member] = await sql`INSERT INTO members (h_number, street_address, primary_contact_name, primary_contact_email, membership_status)
    VALUES ('FEE-TEST-42', 'Testvegen 42', 'Test Kontakt', 'fee@example.test', 'member') RETURNING id::text AS id`;
  await sql`INSERT INTO members (h_number, membership_status) VALUES ('FEE-EXEMPT-43', 'exempt')`;
  const invoicedFile = new File([`member_id\n${member.id}\n`], 'invoiced.csv', { type: 'text/csv' });
  const preview = await feeApi.importAnnualFeeStatuses({ year: 2026, kind: 'invoiced', date: '2026-02-01', apply: false, file: invoicedFile });
  assert.deepEqual(plain(preview.preview), { rowCount: 1, matchedCount: 1, unmatchedCount: 0, unmatched: [] });
  await feeApi.importAnnualFeeStatuses({ year: 2026, kind: 'invoiced', date: '2026-02-01', apply: true, file: invoicedFile });
  const candidate = await feeApi.createCollectionCandidatesExport(2026, (value) => value);
  assert.equal(candidate.count, 1); assert.match(candidate.csv, /FEE-TEST-42/);
  await feeApi.importAnnualFeeStatuses({ year: 2026, kind: 'paid', apply: true,
    file: new File(['H-nummer\nFEE-TEST-42\n'], 'paid.csv', { type: 'text/csv' }) });
  const overview = await api.getAccountingOverview(2026);
  assert.equal(overview.memberCount, 1); assert.equal(overview.exemptMemberCount, 1);
  assert.equal(overview.invoicedMemberCount, 1); assert.equal(overview.paidMemberCount, 1); assert.equal(overview.collectionCandidateCount, 0);
});

test('editing can add a receipt, but cannot steal or silently remove a linked receipt', async () => {
  const input = expense();
  const [saved] = await api.createAccountingExpenses(2026, { batch_id: uuid(), entries: [input] });
  const file = await api.uploadAccountingReceipt(2026, pdf());
  const edited = await api.updateAccountingExpense(2026, { ...input, version: saved.version, attachment_ids: [file.id] });
  await assert.rejects(api.updateAccountingExpense(2026, { ...input, version: edited.version, attachment_ids: [] }), /expenseConflict/);
  assert.equal((await api.getAccountingOverview(2026)).attachments.find((entry) => entry.id === file.id).expense_id, input.id);
});

test('year versions prevent stale edits and budget changes do not modify receipts or prior years', async () => {
  const prior = plain(await api.getAccountingOverview(2026));
  await api.saveAccountingYear({ ...yearInput(2027), version: 1, annual_fee: '300' });
  await assert.rejects(api.saveAccountingYear({ ...yearInput(2027), version: 1, annual_fee: '400' }), /conflict/);
  assert.deepEqual(plain(await api.getAccountingOverview(2026)), prior);
});

test('read-only administrators cannot upload files or change financial state', async () => {
  denied = true;
  try {
    await api.getAccountingOverview(2026);
    await assert.rejects(api.saveAccountingYear(yearInput(2028)), /Forbidden/);
    await assert.rejects(api.uploadAccountingReceipt(2026, pdf()), /Forbidden/);
    await assert.rejects(api.createAccountingExpenses(2026, { batch_id: uuid(), entries: [expense()] }), /Forbidden/);
    await assert.rejects(api.updateAccountingExpense(2026, expense()), /Forbidden/);
    await assert.rejects(api.updateAccountingStatuses(2026, {}), /Forbidden/);
  } finally { denied = false; }
});
