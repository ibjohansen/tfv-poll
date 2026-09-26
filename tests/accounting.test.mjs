import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { accountingDefaults, accountingReference2025 } from '../data/accounting.js';
import { accountingSummary, decimalUnits, convertToOre, normalizeExpense, normalizeExpenseBatch,
  normalizeYearSettings, proposeAccountingYear } from '../lib/accounting-validation.js';
import { suggestReceipt } from '../lib/accounting-receipts.js';
import { accountingWorkbook } from '../lib/accounting-export.js';
import { accountingBudgetChartSeries, accountingChartAxisMoney, accountingChartSeries } from '../lib/accounting-chart.js';
import { collectionCandidatesCsv, parseFeeStatusCsv } from '../lib/accounting-fee-files.js';
import { loadModule, request } from './helpers/load-module.mjs';

const expense = { id: 'a'.repeat(32), supplier: 'Test supplier', invoice_number: 'TEST-1', description: 'Subscription',
  category: 'systems', invoice_date: '2026-09-12', amount: '16.25', currency: 'USD', exchange_rate: '10.123456',
  submitted_on: '', paid_on: '', notes: '', receipt_note: 'Synthetic test', attachment_ids: [], reviewed: true };

test('decimal arithmetic rounds once to NOK øre and rejects malformed or oversized values', () => {
  assert.equal(decimalUnits('1 234,56'), 123456);
  assert.equal(decimalUnits('0.005001', 6), 5001);
  assert.equal(convertToOre(1625, 10123456), 16451);
  assert.equal(convertToOre(1, 1500000), 2);
  for (const value of ['', 'NaN', 'Infinity', '1e4', '-1', '2.345', '1,2.3', true, null]) assert.throws(() => decimalUnits(value));
  assert.throws(() => convertToOre(100000000000, 10000000000));
});

test('expense validation enforces review, period, currency, receipts and reimbursement order', () => {
  assert.equal(normalizeExpense({ ...expense, claimant_name: '  Kari Test  ' }, 2026).claimant_name, 'Kari Test');
  assert.equal(normalizeExpense(expense, 2026).claimant_name, '');
  for (const claimant_name of [42, 'x'.repeat(321), 'Test\u0000person']) assert.throws(() => normalizeExpense({ ...expense, claimant_name }, 2026));
  assert.equal(normalizeExpense(expense, 2026).amount_ore, 16451);
  for (const changes of [{ reviewed: false }, { invoice_date: '2025-09-12' }, { invoice_date: '2026-02-30' },
    { currency: 'NOK' }, { currency: 'XXX' }, { amount: '0' }, { exchange_rate: '0' }, { receipt_note: '' },
    { paid_on: '2026-09-20' }, { submitted_on: '2026-09-21', paid_on: '2026-09-20' }]) assert.throws(() => normalizeExpense({ ...expense, ...changes }, 2026));
  assert.equal(normalizeExpense({ ...expense, submitted_on: '2026-09-20', paid_on: '2026-09-20' }, 2026).paid_on, '2026-09-20');
  assert.throws(() => normalizeExpenseBatch([expense, { ...expense, id: 'b'.repeat(32), supplier: 'Different supplier' }], 2026));
  assert.throws(() => normalizeExpenseBatch([expense, expense], 2026));
  assert.throws(() => normalizeExpenseBatch([{ ...expense, attachment_ids: ['b'.repeat(32)] }, { ...expense, id: 'c'.repeat(32), attachment_ids: ['b'.repeat(32)] }], 2026));
});

test('the supplied scanner regression cases retain their amounts without reading card digits', () => {
  const cases = [
    ['Mailchimp', 'Billing statement\nEssentials plan\n500 contacts\n$13.00\nTax\nMVA\nTax Rate: 25%\n$3.25\nBalance as of October 08, 2025\n$0.00\nPaid via Mast ending in 4904', '16.25', 'USD'],
    ['Microsoft', 'Invoice\nAugust 2026\nInvoice Date: 04.08.2026\nInvoice Number: E0400ZTX11\nDue Date: 04.08.2026\n353,24 NOK\nBilling Summary\nCharges:\n282,59', '353.24', 'NOK'],
    ['Netlify', 'RECEIPT\nPayment date\nSep 12, 2026\nAmount paid\n$9.00\nDescription\nMembers\n$9.00', '9.00', 'USD'],
    ['Hallingdølen', 'Faktura\nFakturadato\n09.02.2026\nTotal sum:\n279,00', '279.00', 'NOK'],
  ];
  for (const [supplier, text, amount, currency] of cases) {
    const result = suggestReceipt(text, supplier);
    assert.equal(result.amount, amount); assert.equal(result.currency, currency);
    assert.equal(result.confidence, 'vendor'); assert.equal(result.paid_on, undefined); assert.equal(result.exchange_rate, undefined);
  }
  assert.equal(suggestReceipt('Total paid via Mast ending in 4904').amount, '');
  assert.equal(suggestReceipt('Total USD 10.00\nTotal USD 20.00').amount, '');
  assert.equal(suggestReceipt(cases[1][1], 'Microsoft').invoice_date, '2026-08-04');
  assert.equal(suggestReceipt(cases[2][1], 'Netlify').invoice_date, '2026-09-12');
  assert.equal(suggestReceipt('Mailchimp', 'mailchimp-receipt-MC001234.pdf').invoice_number, 'MC001234');
  const mailersend = suggestReceipt('Invoice 123456-7890123-001\nDate issue 2026-09-18\nMailerSend, Inc');
  assert.equal(mailersend.invoice_date, '2026-09-18'); assert.equal(mailersend.invoice_number, '123456-7890123-001');
});

test('protocol totals reconcile and missing actual income is never treated as recorded zero', () => {
  const settings = proposeAccountingYear(2026, 900);
  assert.equal(settings.member_count, 411);
  assert.equal(settings.budget.dues, 10275000);
  const summary = accountingSummary(settings, []);
  assert.equal(summary.budgetExpenses, 9300000); assert.equal(summary.budgetIncome - summary.budgetExpenses, 975000);
  assert.equal(summary.actual.dues, null); assert.equal(summary.incomeComplete, false);
  const reference = accountingReference2025.actual;
  const costs = ['board', 'systems', 'accountant', 'trailer', 'other', 'bank'].reduce((sum, key) => sum + reference[key], 0);
  assert.equal(costs, 6738731);
  assert.equal(reference.dues + reference.fees + reference.reminders - costs, 4078269);
  const b = accountingReference2025.balance;
  assert.equal(b.bank + b.receivables, b.equity + b.suppliers + b.otherDebt);
  const changed = proposeAccountingYear(2027, 500, { ...settings, annual_fee_ore: 30000 });
  assert.equal(changed.budget.dues, 15000000); assert.equal(settings.budget.dues, 10275000);
});

test('server recalculates membership budget and preserves explicit zero income', () => {
  const saved = normalizeYearSettings({ year: 2026, version: 0, annual_fee: '250', member_count: 411,
    budget: Object.fromEntries(Object.entries(accountingDefaults.budget2026).map(([key, value]) => [key, String(value / 100)])),
    actual_income: { dues: '', fees: '0', reminders: '20.50' } });
  assert.equal(saved.budget.dues, 10275000); assert.deepEqual(saved.actual_income, { dues: null, fees: 0, reminders: 2050 });
});

test('accountant workbook excludes internal IDs and preserves typed financial fields', async () => {
  const entry = { ...normalizeExpense({ ...expense, supplier: '=HYPERLINK("bad")', claimant_name: '=1+1', notes: '=1+1' }, 2026), batch_id: 'batch-internal' };
  const buffer = await accountingWorkbook({ expenses: [entry], attachments: [{ expense_id: entry.id, original_filename: 'kvittering.pdf' }] }, (value) => value);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('Kostnader');
  const headerValues = sheet.getRow(1).values.slice(1);
  const headers = Object.fromEntries(headerValues.map((header, index) => [header, index + 1]));
  const row = sheet.getRow(2);

  assert.equal(headers.expenseId, undefined); assert.equal(headers.batchId, undefined);
  assert.equal(row.getCell(headers.amount).value, 16.25);
  assert.equal(row.getCell(headers.rate).value, 10.123456);
  assert.equal(row.getCell(headers.nok).value, 164.51);
  assert.ok(row.getCell(headers.invoiceDate).value instanceof Date);
  assert.equal(row.getCell(headers.supplier).value, '=HYPERLINK("bad")');
  assert.equal(row.getCell(headers.notes).value, '=1+1');
  assert.equal(row.getCell(headers.files).value, 'kvittering.pdf');
  assert.equal(row.getCell(headers.claimant).value, '=1+1');
});

test('chart groups monthly costs and carries the cumulative line forward', () => {
  const settings = proposeAccountingYear(2026, 411);
  const entries = [normalizeExpense(expense, 2026), normalizeExpense({ ...expense, id: 'b'.repeat(32), invoice_number: 'TEST-2', invoice_date: '2026-11-01', amount: '10' }, 2026)];
  const series = accountingChartSeries(settings, entries);
  assert.equal(series.expectedIncome, 10275000);
  assert.equal(series.monthly[8], 16451); assert.equal(series.monthly[10], 10123);
  assert.equal(series.cumulative[9], 16451); assert.equal(series.cumulative[11], 26574);
});

test('budget chart distributes every øre evenly across the year', () => {
  const settings = proposeAccountingYear(2026, 411);
  settings.budget.other += 1;
  const series = accountingBudgetChartSeries(settings);
  assert.equal(series.expectedIncome, 10275000);
  assert.equal(series.cumulative[11], 9300001);
  assert.equal(series.monthly.reduce((sum, amount) => sum + amount, 0), 9300001);
  assert.equal(Math.max(...series.monthly) - Math.min(...series.monthly), 1);
});

test('chart axis money is deterministic across server and browser runtimes', () => {
  assert.equal(accountingChartAxisMoney(0, 'nb-NO'), '0\u00a0kr');
  assert.equal(accountingChartAxisMoney(2_775_000, 'nb-NO'), '27,8k\u00a0kr');
  assert.equal(accountingChartAxisMoney(102_750_000, 'nb-NO'), '1m\u00a0kr');
  assert.equal(accountingChartAxisMoney(2_775_000, 'en-GB'), '27.8k\u00a0NOK');
});

test('annual-fee CSV import accepts stable IDs or H-numbers and rejects ambiguity', () => {
  assert.deepEqual(parseFeeStatusCsv('member_id;status\n42;paid\n43;paid\n'), [
    { type: 'member_id', value: '42' }, { type: 'member_id', value: '43' },
  ]);
  assert.deepEqual(parseFeeStatusCsv('\uFEFFH-nummer\nSPG H 42\n'), [{ type: 'h_number', value: 'SPG H 42' }]);
  assert.throws(() => parseFeeStatusCsv('name\nUnknown\n'), /invalidFeeImport/);
  assert.throws(() => parseFeeStatusCsv('member_id\n42\n42\n'), /duplicateFeeImport/);
});

test('collection candidate CSV has exact claim amounts and neutralizes formulas', () => {
  const output = collectionCandidatesCsv({ year: 2026, annualFeeOre: 25000, members: [{ id: '42', h_number: '=1+1',
    cadastral_number: '10/42', section_number: '', street_address: 'Testvegen 1', title_holder: 'Test',
    primary_contact_name: 'Kontakt', primary_contact_email: 'test@example.test', other_contact_emails: [], invoiced_on: '2026-02-01' }] }, (value) => value);
  assert.match(output, /"250\.00"/); assert.match(output, /"'=1\+1"/);
});

test('request guard authenticates before reading uploads and caps bodies without content-length', async () => {
  let denied = true;
  const http = await loadModule('lib/accounting-http.js', {
    './admin-access.js': { requirePermission: async () => { if (denied) throw new Error('Forbidden'); } },
    './api-errors.js': { apiErrorStatus: () => 500 },
    './request-origin.js': { isSameOriginRequest: (req) => req.headers.get('origin') !== 'https://evil.test' },
    './accounting-validation.js': await import('../lib/accounting-validation.js'),
  });
  await assert.rejects(http.accountingWriteRequest(request('/test', { method: 'POST', body: {} })), /Forbidden/);
  denied = false;
  await assert.rejects(http.accountingWriteRequest(request('/test', { method: 'POST', body: {}, headers: { origin: 'https://evil.test' } })), /accessDenied/);
  await assert.rejects(http.accountingWriteRequest(request('/test', { method: 'POST', rawBody: 'x'.repeat(30) }), 20), /tooLarge/);
  assert.deepEqual(JSON.parse(JSON.stringify(await http.accountingWriteRequest(request('/test', { method: 'POST', body: { year: 2026 } })))), { year: 2026 });
});
