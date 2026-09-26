import { accountingSummary } from './accounting-validation.js';

function withCumulative(expectedIncome, monthly) {
  let running = 0;
  const cumulative = monthly.map((amount) => (running += amount));
  return { expectedIncome, monthly, cumulative };
}

export function accountingChartSeries(settings, expenses) {
  const monthly = Array(12).fill(0);
  for (const expense of expenses) {
    if (expense.voided_at || typeof expense.invoice_date !== 'string' || !Number.isSafeInteger(expense.amount_ore)) continue;
    const [year, month] = expense.invoice_date.split('-').map(Number);
    if (year === settings.id && month >= 1 && month <= 12) monthly[month - 1] += expense.amount_ore;
  }
  return withCumulative(accountingSummary(settings, expenses).budgetIncome, monthly);
}

export function accountingBudgetChartSeries(settings) {
  const { budgetIncome, budgetExpenses } = accountingSummary(settings, []);
  const monthlyBase = Math.floor(budgetExpenses / 12);
  const remainder = budgetExpenses % 12;
  const monthly = Array.from({ length: 12 }, (_, index) => monthlyBase + (index < remainder ? 1 : 0));
  return withCumulative(budgetIncome, monthly);
}

export function accountingChartAxisMoney(valueOre, locale = 'nb-NO') {
  const valueNok = valueOre / 100;
  const magnitude = Math.abs(valueNok);
  const divisor = magnitude >= 1_000_000 ? 1_000_000 : magnitude >= 1_000 ? 1_000 : 1;
  const suffix = divisor === 1_000_000 ? 'm' : divisor === 1_000 ? 'k' : '';
  const rounded = Math.round((valueNok / divisor) * 10) / 10;
  const decimal = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  const localized = locale.toLowerCase().startsWith('nb') ? decimal.replace('.', ',') : decimal;
  const currency = locale.toLowerCase().startsWith('nb') ? 'kr' : 'NOK';
  return `${localized}${suffix}\u00a0${currency}`;
}
