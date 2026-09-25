import { decimalString } from './accounting-validation.js';

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function accountingCsv(data, t) {
  const headers = ['ID', t('invoiceDate'), t('supplier'), t('invoice'), t('description'), t('category'),
    t('amount'), t('currency'), t('rate'), t('nok'), t('submittedDate'), t('paidDate'), t('notes'), t('files'), t('receiptNote')];
  const rows = data.expenses.map((expense) => [expense.id, expense.invoice_date, expense.supplier, expense.invoice_number,
    expense.description, t(`categories.${expense.category}`), decimalString(expense.amount_minor), expense.currency,
    decimalString(expense.exchange_rate_million, 6), decimalString(expense.amount_ore), expense.submitted_on,
    expense.paid_on, expense.notes, data.attachments.filter((file) => file.expense_id === expense.id).map((file) => file.original_filename).join(' | '), expense.receipt_note]);
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
