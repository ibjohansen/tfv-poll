import ExcelJS from 'exceljs';
import { accountingCategories } from '../data/accounting.js';

function dateValue(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)) : String(value);
}

function scaledNumber(value, scale) {
  return Number.isSafeInteger(value) ? value / scale : null;
}

const columnDefinitions = (t) => [
  ['year', t('year'), 12],
  ['invoice_date', t('invoiceDate'), 15],
  ['supplier', t('supplier'), 28],
  ['invoice_number', t('invoice'), 24],
  ['description', t('description'), 36],
  ['claimant_name', t('claimant'), 28],
  ['account', t('account'), 12],
  ['category', t('category'), 28],
  ['amount', t('amount'), 20],
  ['currency', t('currency'), 10],
  ['rate', t('rate'), 22],
  ['nok', t('nok'), 16],
  ['submitted_on', t('submittedDate'), 15],
  ['paid_on', t('paidDate'), 15],
  ['status', t('status'), 22],
  ['notes', t('notes'), 36],
  ['files', t('files'), 40],
  ['receipt_note', t('receiptNote'), 40],
];

export async function accountingWorkbook(data, t) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Medlemsservice';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Kostnader', {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { defaultRowHeight: 20 },
  });
  const columns = columnDefinitions(t);
  sheet.columns = columns.map(([key, header, width]) => ({ key, header, width }));
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(columns.length).letter}1` };

  const header = sheet.getRow(1);
  header.height = 30;
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF315B49' } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  for (const expense of data.expenses) {
    const category = accountingCategories.find((entry) => entry.id === expense.category);
    const status = expense.paid_on ? 'paid' : expense.submitted_on ? 'pending' : 'unsubmitted';
    const row = sheet.addRow({
      year: expense.year,
      invoice_date: dateValue(expense.invoice_date),
      supplier: expense.supplier,
      invoice_number: expense.invoice_number,
      description: expense.description,
      claimant_name: expense.claimant_name || '',
      account: category?.code || '',
      category: t(`categories.${expense.category}`),
      amount: scaledNumber(expense.amount_minor, 100),
      currency: expense.currency,
      rate: scaledNumber(expense.exchange_rate_million, 1_000_000),
      nok: scaledNumber(expense.amount_ore, 100),
      submitted_on: dateValue(expense.submitted_on),
      paid_on: dateValue(expense.paid_on),
      status: t(status),
      notes: expense.notes,
      files: data.attachments.filter((file) => file.expense_id === expense.id).map((file) => file.original_filename).join(' | '),
      receipt_note: expense.receipt_note,
    });
    row.alignment = { vertical: 'top', wrapText: true };
  }

  for (const key of ['invoice_date', 'submitted_on', 'paid_on']) sheet.getColumn(key).numFmt = 'dd.mm.yyyy';
  for (const key of ['amount', 'nok']) sheet.getColumn(key).numFmt = '#,##0.00';
  sheet.getColumn('rate').numFmt = '#,##0.000000';
  return workbook.xlsx.writeBuffer();
}
