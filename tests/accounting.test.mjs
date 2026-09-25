import test from 'node:test';
import assert from 'node:assert/strict';
import { accountingDefaults, accountingReference2025 } from '../data/accounting.js';
import { accountingSummary, decimalUnits, convertToOre, normalizeExpense, normalizeExpenseBatch,
  normalizeYearSettings, proposeAccountingYear } from '../lib/accounting-validation.js';
import { suggestReceipt } from '../lib/accounting-receipts.js';
import { accountingCsv } from '../lib/accounting-export.js';
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

test('CSV export preserves monetary precision and neutralizes spreadsheet formulas', () => {
  const entry = normalizeExpense({ ...expense, supplier: '=HYPERLINK("bad")', notes: '\t=1+1' }, 2026);
  const output = accountingCsv({ expenses: [entry], attachments: [] }, (value) => value);
  assert.match(output, /"164.51"/); assert.match(output, /"10.123456"/);
  assert.match(output, /"'=HYPERLINK/); assert.match(output, /"'=1\+1"/);
  assert.match(accountingCsv({ expenses: [{ ...entry, notes: '\t=1+1' }], attachments: [] }, (value) => value), /"'\t=1\+1"/);
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
