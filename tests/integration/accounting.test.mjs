import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createTestDatabase } from '../helpers/postgres.mjs';
import { loadModule } from '../helpers/load-module.mjs';
import * as validation from '../../lib/accounting-validation.js';
import * as upload from '../../lib/upload-validation.js';
import { accountingStatements, verifyAccountingSchema } from '../../scripts/release-accounting-schema.mjs';

const db = createTestDatabase();
const id = () => crypto.randomUUID().replaceAll('-', '');
const year = 2087;
let api;
const entry = (extra = {}) => ({ id: id(), supplier: 'Synthetic accounting supplier', invoice_number: id(),
  description: 'Isolated integration test', category: 'systems', invoice_date: `${year}-09-12`,
  amount: '16.25', currency: 'USD', exchange_rate: '10.123456', reviewed: true,
  receipt_note: 'Synthetic test only', attachment_ids: [], ...extra });
const batch = (entries) => api.createAccountingExpenses(year, { batch_id: id(), entries });
before(async () => {
  await db.migrate();
  api = await loadModule('lib/accounting.js', {
    'node:crypto': crypto, './db.js': { getSql: () => db.sql }, './mock-store.js': { isMockMode: () => false },
    './admin-access.js': { requirePermission: async () => ({ email: 'accountant@example.test' }) },
    './cms-storage.js': { uploadCmsObject: async () => {}, deleteCmsObject: async () => {} },
    './upload-validation.js': upload, './accounting-validation.js': validation,
    './accounting-pdf.js': { readAccountingReceipt: async () => ({ amount: '16.25', currency: 'USD' }) },
  });
  await api.saveAccountingYear({ year, version: 0, member_count: 411, annual_fee: '250',
    budget: { fees: '0', reminders: '0', board: '53000', systems: '5000', accountant: '5000', trailer: '8000', other: '20000', bank: '2000' },
    actual_income: { dues: '', fees: '0', reminders: '0' } });
});
after(() => db.close());

test('accounting-only schema is idempotent and preserves saved budgets', async () => {
  const schema = await readFile(new URL('../../database/schema.sql', import.meta.url), 'utf8');
  const statements = accountingStatements(schema);
  assert.equal(statements.length, 23);
  await db.sql.transaction(statements.map((statement) => db.sql.query(statement)));
  await verifyAccountingSchema(db.pool);
  const data = await api.getAccountingOverview(year);
  assert.equal(data.settings.budget.dues, 10275000);
  assert.equal(data.settings.version, 1);
});

test('real PostgreSQL stores exact FX and redacts private attachment keys from audit', async () => {
  const file = await api.uploadAccountingReceipt(year, new File([`%PDF-1.7\n${id()}`], 'synthetic.pdf', { type: 'application/pdf' }));
  const input = entry({ attachment_ids: [file.id] });
  await batch([input]);
  const overview = await api.getAccountingOverview(year);
  assert.equal(overview.expenses.find((row) => row.id === input.id).amount_ore, 16451);
  assert.equal(overview.attachments.find((row) => row.id === file.id).expense_id, input.id);
  const events = await db.sql`SELECT changed_by, after_value FROM audit_log WHERE table_name='accounting_attachments' AND row_id=${file.id}`;
  assert.equal(events.length, 2);
  assert.ok(events.every((event) => event.changed_by === 'accountant@example.test' && !('storage_key' in event.after_value)));
});

test('concurrent batches cannot attach the same receipt twice', async () => {
  const file = await api.uploadAccountingReceipt(year, new File([`%PDF-1.7\n${id()}`], 'concurrent.pdf', { type: 'application/pdf' }));
  const inputs = [entry({ attachment_ids: [file.id] }), entry({ attachment_ids: [file.id] })];
  const results = await Promise.allSettled(inputs.map((input) => batch([input])));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'conflict');
  const rows = await db.sql`SELECT id FROM accounting_expenses WHERE id=ANY(${inputs.map((input) => input.id)}::text[])`;
  assert.equal(rows.length, 1);
});

test('a duplicate invoice rolls back every expense in its batch', async () => {
  const invoice = id();
  const inputs = [entry({ invoice_number: invoice }), entry({ invoice_number: invoice })];
  await assert.rejects(batch(inputs), (error) => error.code === '23505');
  assert.equal((await db.sql`SELECT id FROM accounting_expenses WHERE id=ANY(${inputs.map((input) => input.id)}::text[])`).length, 0);
});

test('concurrent payment updates succeed once and stale batches do not partially update', async () => {
  const inputs = [entry(), entry()];
  const created = await batch(inputs);
  const submitted = await api.updateAccountingStatuses(year, { entries: created, action: 'submit', date: `${year}-09-18` });
  const results = await Promise.allSettled([1, 2].map(() => api.updateAccountingStatuses(year, { entries: submitted, action: 'pay', date: `${year}-09-20` })));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const paid = results.find((result) => result.status === 'fulfilled').value;
  await assert.rejects(api.updateAccountingExpense(year, { ...inputs[0], version: paid.find((item) => item.id === inputs[0].id).version,
    amount: '100', submitted_on: `${year}-09-18`, paid_on: `${year}-09-20` }), /expenseConflict/);
});
