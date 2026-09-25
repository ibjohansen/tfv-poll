'use client';

import AccountingTable from '@/components/AccountingTable';
import { useI18n } from '@/components/LocaleProvider';
import { accountingSummary } from '@/lib/accounting-validation';

export default function AccountingReport({ current, next }) {
  const { t, formatLocale } = useI18n('accounting');
  const summary = accountingSummary(current.settings, current.expenses);
  const money = (value) => new Intl.NumberFormat(formatLocale, { style: 'currency', currency: 'NOK' }).format(value / 100);
  return <article className="accounting-panel accounting-report"><p className="eyebrow">Turufjell Vel · 928 968 899</p><h2>{t('reportTitle', { year: current.year, nextYear: next.year })}</h2><p>{t('reportIntro', { nextYear: next.year })}</p>
    <button type="button" className="admin-button accounting-no-print" onClick={() => window.print()}>{t('print')}</button>
    {!current.settings.version && <p className="accounting-notice">{t('reportNoYear')}</p>}{!next.settings.version && <p className="accounting-notice">{t('noNextBudget')}</p>}
    <p>{next.settings.member_count} × {money(next.settings.annual_fee_ore)} = {money(next.settings.budget.dues)}</p>
    <AccountingTable settings={current.settings} expenses={current.expenses} nextSettings={next.settings} />
    {!summary.incomeComplete && <p className="accounting-notice">{t('incomplete')}</p>}
    <dl className="accounting-balance">{[['registeredCosts', summary.expenses], ['unsubmitted', summary.unsubmitted], ['paid', summary.paid], ['outstanding', summary.outstanding]].map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{money(value)}</dd></div>)}</dl>
    <p>{t('supplementary')}</p><p>{t('source')} {t('sourceNote')}</p>
  </article>;
}
