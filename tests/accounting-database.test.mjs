import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { loadModule, plain } from './helpers/load-module.mjs';
import * as validation from '../lib/accounting-validation.js';
import * as upload from '../lib/upload-validation.js';

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
let api, schema, denied = false;
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
    './admin-access.js': { requirePermission: async (permission) => { if (denied && permission !== 'read') throw new Error('Forbidden'); return { email: 'accountant@example.test' }; } },
    './cms-storage.js': { uploadCmsObject: async (key, bytes) => { storage.set(key, bytes); }, deleteCmsObject: async (key) => { storage.delete(key); } },
    './upload-validation.js': upload, './accounting-validation.js': validation,
    './accounting-pdf.js': { readAccountingReceipt: async () => ({ amount: '16.25', currency: 'USD' }) },
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

test('a receipt from another year cannot be attached and manual entries require an explanation', async () => {
  const file = await api.uploadAccountingReceipt(2027, pdf());
  await assert.rejects(api.createAccountingExpenses(2026, { batch_id: uuid(), entries: [expense({ attachment_ids: [file.id] })] }), /conflict/);
  await assert.rejects(api.createAccountingExpenses(2026, { batch_id: uuid(), entries: [expense({ receipt_note: '' })] }), /receiptRequired/);
});

test('payment requires submission, stale batch updates are atomic, and paid amounts are protected', async () => {
  const a = expense(), b = expense();
  const entries = await api.createAccountingExpenses(2026, { batch_id: uuid(), entries: [a, b] });
  await assert.rejects(api.updateAccountingStatuses(2026, { entries, action: 'pay', date: '2026-09-20' }), /statusConflict/);
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
