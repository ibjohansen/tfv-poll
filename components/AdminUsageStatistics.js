import Link from 'next/link';
import { USAGE_PERIODS, usageDeviceLabels, usagePageLabels } from '@/lib/usage-metrics';
import UsageTrendChart from '@/components/UsageTrendChart';

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('nb-NO', { dateStyle: 'medium', timeZone: 'Europe/Oslo' }).format(new Date(`${value}T12:00:00Z`));
}

function formatBucket(value, granularity) {
  if (granularity === 'month') {
    return new Intl.DateTimeFormat('nb-NO', { month: 'long', year: 'numeric', timeZone: 'Europe/Oslo' }).format(new Date(`${value}T12:00:00Z`));
  }
  const date = formatDate(value);
  return granularity === 'week' ? `Uke fra ${date}` : date;
}

function Distribution({ title, rows, labelFor, total }) {
  return <section className="usage-panel"><h2>{title}</h2>{rows.length ? <ul className="usage-bars">{rows.map((row) => {
    const key = row.pageType || row.deviceCategory;
    const percent = total ? Math.round((row.views / total) * 100) : 0;
    return <li key={key}><div><strong>{labelFor[key] || key}</strong><span>{row.views.toLocaleString('nb-NO')} · {percent} %</span></div><span className="usage-bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></span></li>;
  })}</ul> : <p className="usage-empty">Ingen sidevisninger i perioden.</p>}</section>;
}

export default function AdminUsageStatistics({ data }) {
  const periodLabel = (period) => period === 'all' ? 'Hele perioden' : period === 365 ? '1 år' : period === 730 ? '2 år' : `${period} dager`;
  const bucketLabel = data.granularity === 'month' ? 'måned' : data.granularity === 'week' ? 'uke' : 'dag';
  return <div className="usage-dashboard">
    <section className="usage-intro"><div><p className="eyebrow">Personvernvennlig statistikk</p><h2>{data.total.toLocaleString('nb-NO')} sidevisninger</h2><p>{formatDate(data.from)}–{formatDate(data.to)}. Statistikken er dagsaggregert og inneholder ikke IP-adresser, cookies, bruker-ID-er, rå URL-er eller personlige lenker.</p></div><nav aria-label="Velg periode">{USAGE_PERIODS.map((period) => <Link key={period} href={`/admin/usage?days=${period}`} aria-current={data.period === period ? 'page' : undefined}>{periodLabel(period)}</Link>)}</nav></section>
    <section className="usage-panel usage-trend"><div className="usage-panel-heading"><div><p className="eyebrow">Utvikling</p><h2>Sidevisninger over tid</h2></div><span>Per {bucketLabel}</span></div><UsageTrendChart rows={data.trend} granularity={data.granularity} /></section>
    <div className="usage-grid"><Distribution title="Mest besøkte sidetyper" rows={data.pages} labelFor={usagePageLabels} total={data.total} /><Distribution title="Enhetskategorier" rows={data.devices} labelFor={usageDeviceLabels} total={data.total} /></div>
    <section className="usage-panel"><h2>Datagrunnlag per {bucketLabel}</h2>{data.trend.length ? <div className="admin-table-scroll"><table className="admin-table"><caption>Aggregerte sidevisninger per {bucketLabel} i valgt periode</caption><thead><tr><th scope="col">Periode</th><th scope="col">Sidevisninger</th></tr></thead><tbody>{[...data.trend].reverse().map((row) => <tr key={row.date}><th scope="row">{formatBucket(row.date, data.granularity)}</th><td>{row.views.toLocaleString('nb-NO')}</td></tr>)}</tbody></table></div> : <p className="usage-empty">Ingen sidevisninger i perioden.</p>}</section>
    <p className="privacy-subnote">De anonyme dagsaggregatene beholdes som historisk statistikk uten automatisk sletting. Besøk, varighet, navigasjonsforløp, nettleser, operativsystem og referrer samles ikke inn.</p>
  </div>;
}
