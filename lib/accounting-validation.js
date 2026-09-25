import { accountingCategories, accountingCurrencies, accountingDefaults } from '../data/accounting.js';

export class AccountingError extends Error {
  constructor(code, status = 400) { super(code); this.name = 'AccountingError'; this.code = code; this.status = status; }
}

export function accountingYear(value) {
  if (!/^20\d{2}$/.test(String(value))) throw new AccountingError('invalidYear');
  return Number(value);
}

export function accountingId(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{32}$/.test(value)) throw new AccountingError('invalidInput');
  return value;
}

export function accountingVersion(value, allowNew = false) {
  if (!Number.isSafeInteger(value) || value < (allowNew ? 0 : 1)) throw new AccountingError('invalidInput');
  return value;
}

// Decimal input is parsed as text; binary floating point never computes money.
export function decimalUnits(value, digits = 2, maximum = 100000000000) {
  const text = String(value ?? '').trim().replace(/[ \u00a0\u202f]/g, '').replace(',', '.');
  if (!new RegExp(`^\\d{1,12}(?:\\.\\d{1,${digits}})?$`).test(text)) throw new AccountingError('invalidAmount');
  const [whole, fraction = ''] = text.split('.');
  const result = BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, '0'));
  if (result > BigInt(maximum)) throw new AccountingError('invalidAmount');
  return Number(result);
}

export function decimalString(units, digits = 2) {
  const value = String(units).padStart(digits + 1, '0');
  return `${value.slice(0, -digits)}.${value.slice(-digits)}`;
}

export function convertToOre(amountMinor, rateMillion) {
  const result = (BigInt(amountMinor) * BigInt(rateMillion) + 500000n) / 1000000n;
  if (result > 100000000000n) throw new AccountingError('invalidAmount');
  return Number(result);
}

export function accountingDate(value, optional = false) {
  if (optional && (value === '' || value === null || value === undefined)) return null;
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) throw new AccountingError('invalidDate');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new AccountingError('invalidDate');
  return value;
}

function text(value, max, required = false) {
  if (typeof value !== 'string' || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new AccountingError('invalidInput');
  const result = value.trim();
  if (required && !result) throw new AccountingError('invalidInput');
  return result;
}

export function statusDates(input) {
  const submitted_on = accountingDate(input.submitted_on, true);
  const paid_on = accountingDate(input.paid_on, true);
  if (paid_on && (!submitted_on || paid_on < submitted_on)) throw new AccountingError('invalidStatus');
  return { submitted_on, paid_on };
}

export function normalizeExpense(input, year) {
  if (!input || typeof input !== 'object' || input.reviewed !== true) throw new AccountingError('reviewRequired');
  const invoice_date = accountingDate(input.invoice_date);
  if (Number(invoice_date.slice(0, 4)) !== accountingYear(year)) throw new AccountingError('wrongYear');
  const category = accountingCategories.find((entry) => entry.id === input.category && entry.kind === 'expense');
  if (!category || !accountingCurrencies.includes(input.currency)) throw new AccountingError('invalidInput');
  const amount_minor = decimalUnits(input.amount);
  const exchange_rate_million = decimalUnits(input.exchange_rate, 6, 10000000000);
  if (!amount_minor || !exchange_rate_million || (input.currency === 'NOK' && exchange_rate_million !== 1000000)) throw new AccountingError('invalidAmount');
  const amount_ore = convertToOre(amount_minor, exchange_rate_million);
  if (!amount_ore) throw new AccountingError('invalidAmount');
  const attachment_ids = input.attachment_ids ?? [];
  if (!Array.isArray(attachment_ids) || attachment_ids.length > 10 || new Set(attachment_ids).size !== attachment_ids.length) throw new AccountingError('invalidInput');
  attachment_ids.forEach(accountingId);
  const receipt_note = text(input.receipt_note ?? '', 500);
  if (!attachment_ids.length && !receipt_note) throw new AccountingError('receiptRequired');
  return {
    id: accountingId(input.id), supplier: text(input.supplier, 160, true), invoice_number: text(input.invoice_number ?? '', 100),
    description: text(input.description, 500, true), category: category.id, invoice_date, currency: input.currency,
    amount_minor, exchange_rate_million, amount_ore, ...statusDates(input), notes: text(input.notes ?? '', 2000),
    receipt_note, attachment_ids,
  };
}

export function normalizeExpenseBatch(input, year) {
  if (!Array.isArray(input) || !input.length || input.length > 30) throw new AccountingError('invalidBatch');
  const entries = input.map((entry) => normalizeExpense(entry, year));
  const attachments = entries.flatMap((entry) => entry.attachment_ids);
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length || new Set(attachments).size !== attachments.length
    || new Set(entries.map((entry) => entry.supplier.toLocaleLowerCase('nb-NO'))).size !== 1) throw new AccountingError('invalidBatch');
  return entries;
}

export function normalizeYearSettings(input) {
  const year = accountingYear(input.year);
  const annual_fee_ore = decimalUnits(input.annual_fee, 2, 100000000);
  const member_count = Number(input.member_count);
  if (!/^\d{1,6}$/.test(String(input.member_count)) || !Number.isSafeInteger(member_count) || member_count < 0 || member_count > 100000) throw new AccountingError('invalidInput');
  const budget = {}, actual_income = {};
  for (const category of accountingCategories) {
    budget[category.id] = category.id === 'dues' ? annual_fee_ore * member_count : decimalUnits(input.budget?.[category.id]);
    if (category.kind === 'income') actual_income[category.id] = input.actual_income?.[category.id] === '' || input.actual_income?.[category.id] == null
      ? null : decimalUnits(input.actual_income[category.id]);
  }
  if (budget.dues > 100000000000) throw new AccountingError('invalidAmount');
  return { year, annual_fee_ore, member_count, budget, actual_income, version: accountingVersion(input.version, true) };
}

export function proposeAccountingYear(year, memberCount = 0, previous = null) {
  accountingYear(year);
  const annual_fee_ore = previous?.annual_fee_ore ?? decimalUnits(accountingDefaults.annualFee);
  const member_count = year === 2026 ? accountingDefaults.members2026 : memberCount;
  return { id: year, annual_fee_ore, member_count, version: 0,
    budget: { ...(year === 2026 ? accountingDefaults.budget2026 : previous?.budget ?? accountingDefaults.budget2026), dues: annual_fee_ore * member_count },
    actual_income: { dues: null, fees: null, reminders: null } };
}

export function accountingSummary(settings, expenses) {
  const actual = Object.fromEntries(accountingCategories.map((category) => [category.id,
    category.kind === 'income' ? settings.actual_income[category.id] : 0]));
  let unsubmitted = 0, outstanding = 0, paid = 0;
  for (const expense of expenses) {
    if (expense.voided_at) continue;
    actual[expense.category] += expense.amount_ore;
    if (expense.paid_on) paid += expense.amount_ore;
    else outstanding += expense.amount_ore;
    if (!expense.submitted_on) unsubmitted += expense.amount_ore;
  }
  const total = (kind, values) => accountingCategories.filter((entry) => entry.kind === kind).reduce((sum, entry) => sum + (values[entry.id] ?? 0), 0);
  const incomeComplete = accountingCategories.filter((entry) => entry.kind === 'income').every((entry) => actual[entry.id] !== null);
  return { actual, incomeComplete, budgetIncome: total('income', settings.budget), budgetExpenses: total('expense', settings.budget),
    income: total('income', actual), expenses: total('expense', actual), unsubmitted, outstanding, paid };
}
