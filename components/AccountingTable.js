'use client';

import { useI18n } from '@/components/LocaleProvider';
import { accountingCategories, accountingReference2025 } from '@/data/accounting';
import { accountingSummary } from '@/lib/accounting-validation';

export default function AccountingTable({ settings, expenses, nextSettings, showReference = true }) {
  const { t, formatLocale } = useI18n('accounting');
  const summary = accountingSummary(settings, expenses);
  const next = nextSettings ? accountingSummary(nextSettings, []) : null;
  const money = (value) => value === null ? t('notEntered') : new Intl.NumberFormat(formatLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100);
  const reference = accountingReference2025.actual;
  const sum = (kind, values) => accountingCategories.filter((entry) => entry.kind === kind).reduce((total, entry) => total + values[entry.id], 0);
  return <div className="accounting-table-scroll" role="region" aria-label={t('overview')} tabIndex={0}>
    <table className="admin-table accounting-table"><caption>{t('proposedBudget', { year: settings.id })} / {t('actual')} (NOK)</caption>
      <thead><tr><th scope="col">{t('account')}</th><th scope="col">{t('category')}</th>{showReference && <th scope="col">{t('reference')}</th>}<th scope="col">{t('proposedBudget', { year: settings.id })}</th><th scope="col">{t('actual')} {settings.id}</th>{next && <th scope="col">{t('proposedBudget', { year: nextSettings.id })}</th>}</tr></thead>
      <tbody>{['income', 'expense'].map((kind) => <AccountingRows key={kind} kind={kind} settings={settings} summary={summary} next={next} nextSettings={nextSettings} reference={reference} showReference={showReference} money={money} t={t} sum={sum} />)}</tbody>
      <tfoot><tr><th scope="row" colSpan={2}>{t('result')}</th>{showReference && <td>{money(sum('income', reference) - sum('expense', reference))}</td>}<td>{money(summary.budgetIncome - summary.budgetExpenses)}</td><td>{summary.incomeComplete ? money(summary.income - summary.expenses) : t('notEntered')}</td>{next && <td>{money(next.budgetIncome - next.budgetExpenses)}</td>}</tr></tfoot>
    </table>
  </div>;
}

function AccountingRows({ kind, settings, summary, next, nextSettings, reference, showReference, money, t, sum }) {
  return <>
    {accountingCategories.filter((entry) => entry.kind === kind).map((category) => <tr key={category.id}>
      <td>{category.code || '–'}</td><th scope="row">{t(`categories.${category.id}`)}</th>
      {showReference && <td>{money(reference[category.id])}</td>}<td>{money(settings.budget[category.id])}</td><td>{money(summary.actual[category.id])}</td>{next && <td>{money(nextSettings.budget[category.id])}</td>}
    </tr>)}
    <tr className="accounting-subtotal"><th scope="row" colSpan={2}>{t(kind === 'income' ? 'totalIncome' : 'totalCosts')}</th>{showReference && <td>{money(sum(kind, reference))}</td>}<td>{money(kind === 'income' ? summary.budgetIncome : summary.budgetExpenses)}</td><td>{kind === 'income' && !summary.incomeComplete ? t('notEntered') : money(kind === 'income' ? summary.income : summary.expenses)}</td>{next && <td>{money(kind === 'income' ? next.budgetIncome : next.budgetExpenses)}</td>}</tr>
  </>;
}
