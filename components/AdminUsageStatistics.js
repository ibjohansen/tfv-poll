import Link from 'next/link';
import { USAGE_PERIODS } from '@/lib/usage-metrics';
import UsageTrendChart from '@/components/UsageTrendChart';
import { getServerI18n } from '@/lib/i18n/server';

function formatDate(value, locale) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Europe/Oslo' }).format(new Date(`${value}T12:00:00Z`));
}

function formatBucket(value, granularity, locale, t) {
  if (granularity === 'month') {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'Europe/Oslo' }).format(new Date(`${value}T12:00:00Z`));
  }
  const date = formatDate(value, locale);
  return granularity === 'week' ? t('weekFrom', {date}) : date;
}

function Distribution({ title, rows, labelFor, total, locale, empty }) {
  return <section className="usage-panel"><h2>{title}</h2>{rows.length ? <ul className="usage-bars">{rows.map((row) => {
    const key = row.pageType || row.deviceCategory;
    const percent = total ? Math.round((row.views / total) * 100) : 0;
    return <li key={key}><div><strong>{labelFor[key] || key}</strong><span>{row.views.toLocaleString(locale)} · {percent} %</span></div><span className="usage-bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></span></li>;
  })}</ul> : <p className="usage-empty">{empty}</p>}</section>;
}

export default async function AdminUsageStatistics({ data }) {
  const { t, locale } = await getServerI18n('admin.usageDashboard');
  const numberLocale = locale === 'en' ? 'en-GB' : 'nb-NO';
  const periodLabel = (period) => period === 'all' ? t('all') : period === 365 ? t('year') : period === 730 ? t('twoYears') : t('days', {count: period});
  const bucketLabel = t(data.granularity === 'month' ? 'month' : data.granularity === 'week' ? 'week' : 'day');
  const pageLabels = { home: t('pages.home'), survey: t('pages.survey'), self_service: t('pages.self_service'), article: t('pages.article') };
  const deviceLabels = { mobile: t('devicesMap.mobile'), tablet: t('devicesMap.tablet'), desktop: t('devicesMap.desktop'), unknown: t('devicesMap.unknown') };
  const chartLabels = { empty: t('empty'), title: t('overTime'), explore: t('chartExplore'), point: t('chartPoint'), value: t('chartValue') };
  return <div className="usage-dashboard">
    <section className="usage-intro"><div><p className="eyebrow">{t('eyebrow')}</p><h2>{t('views', {count: data.total.toLocaleString(numberLocale)})}</h2><p>{t('privacySummary', {from: formatDate(data.from, numberLocale), to: formatDate(data.to, numberLocale)})}</p></div><nav aria-label={t('choosePeriod')}>{USAGE_PERIODS.map((period) => <Link key={period} href={`/admin/usage?days=${period}`} aria-current={data.period === period ? 'page' : undefined}>{periodLabel(period)}</Link>)}</nav></section>
    <section className="usage-panel usage-trend"><div className="usage-panel-heading"><div><p className="eyebrow">{t('development')}</p><h2>{t('overTime')}</h2></div><span>{t('per', {bucket: bucketLabel})}</span></div><UsageTrendChart rows={data.trend} granularity={data.granularity} locale={numberLocale} labels={chartLabels} /></section>
    <div className="usage-grid"><Distribution title={t('popularPages')} rows={data.pages} labelFor={pageLabels} total={data.total} locale={numberLocale} empty={t('empty')} /><Distribution title={t('devices')} rows={data.devices} labelFor={deviceLabels} total={data.total} locale={numberLocale} empty={t('empty')} /></div>
    <section className="usage-panel"><h2>{t('basis', {bucket: bucketLabel})}</h2>{data.trend.length ? <div className="admin-table-scroll"><table className="admin-table"><caption>{t('caption', {bucket: bucketLabel})}</caption><thead><tr><th scope="col">{t('period')}</th><th scope="col">{t('pageViews')}</th></tr></thead><tbody>{[...data.trend].reverse().map((row) => <tr key={row.date}><th scope="row">{formatBucket(row.date, data.granularity, numberLocale, t)}</th><td>{row.views.toLocaleString(numberLocale)}</td></tr>)}</tbody></table></div> : <p className="usage-empty">{t('empty')}</p>}</section>
    <p className="privacy-subnote">{t('retention')}</p>
  </div>;
}
