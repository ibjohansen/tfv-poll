'use client';

import { useId, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { accountingBudgetChartSeries, accountingChartAxisMoney, accountingChartSeries } from '@/lib/accounting-chart';

const width = 900;
const height = 340;
const margin = { top: 24, right: 24, bottom: 48, left: 74 };

export default function AccountingChart({ settings, expenses }) {
  const { t, formatLocale } = useI18n('accounting');
  const id = useId();
  const [view, setView] = useState('actual');
  const series = view === 'budget' ? accountingBudgetChartSeries(settings) : accountingChartSeries(settings, expenses);
  const monthlyLabel = t(view === 'budget' ? 'monthlyBudgetCosts' : 'monthlyActualCosts');
  const cumulativeLabel = t(view === 'budget' ? 'cumulativeBudgetCosts' : 'cumulativeActualCosts');
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maximum = Math.max(1, series.expectedIncome, ...series.monthly, ...series.cumulative) * 1.08;
  const y = (value) => margin.top + plotHeight - (value / maximum) * plotHeight;
  const step = plotWidth / 12;
  const barWidth = Math.min(38, step * .58);
  const months = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat(formatLocale, { month: 'short' }).format(new Date(Date.UTC(settings.id, month, 1))));
  const money = (value) => new Intl.NumberFormat(formatLocale, { style: 'currency', currency: 'NOK', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value / 100);
  const points = series.cumulative.map((value, index) => `${margin.left + step * (index + .5)},${y(value)}`).join(' ');
  const ticks = [0, .25, .5, .75, 1].map((part) => maximum * part);

  return <section className="accounting-chart" data-view={view} aria-labelledby={`${id}-heading`}>
    <div className="accounting-chart-heading"><div><h3 id={`${id}-heading`}>{t('chartTitle')}</h3>
      <p>{t(view === 'budget' ? 'chartBudgetHelp' : 'chartActualHelp')}</p>
      <div className="accounting-chart-toggle" role="group" aria-label={t('chartView')}>
        <button type="button" className="admin-button" aria-pressed={view === 'actual'} onClick={() => setView('actual')}>{t('chartActual')}</button>
        <button type="button" className="admin-button" aria-pressed={view === 'budget'} onClick={() => setView('budget')}>{t('chartBudget')}</button>
      </div></div>
      <div className="accounting-chart-legend" aria-label={t('chartLegend')}>
        <span><i className="accounting-chart-swatch is-income" />{t('expectedIncome')}</span>
        <span><i className="accounting-chart-swatch is-monthly" />{monthlyLabel}</span>
        <span><i className="accounting-chart-swatch is-cumulative" />{cumulativeLabel}</span>
      </div>
    </div>
    <div className="accounting-chart-scroll" role="region" aria-label={t('chartTitle')} tabIndex={0}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title ${id}-description`}>
        <title id={`${id}-title`}>{`${t('chartTitle')} ${settings.id}`}</title>
        <desc id={`${id}-description`}>{t('chartDescription', { view: t(view === 'budget' ? 'chartBudget' : 'chartActual'), income: money(series.expectedIncome) })}</desc>
        {ticks.map((tick) => <g key={tick}><line className="accounting-chart-grid" x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} />
          <text className="accounting-chart-axis" x={margin.left - 10} y={y(tick) + 4} textAnchor="end">{accountingChartAxisMoney(tick, formatLocale)}</text></g>)}
        {series.monthly.map((amount, index) => {
          const x = margin.left + step * (index + .5) - barWidth / 2;
          return <g key={months[index]}><rect className="accounting-chart-bar" x={x} y={y(amount)} width={barWidth} height={Math.max(0, margin.top + plotHeight - y(amount))} rx="3">
            <title>{`${months[index]}: ${money(amount)}`}</title></rect>
            <text className="accounting-chart-axis" x={margin.left + step * (index + .5)} y={height - 18} textAnchor="middle">{months[index]}</text></g>;
        })}
        <line className="accounting-chart-income" data-series="expected-income" x1={margin.left} x2={width - margin.right} y1={y(series.expectedIncome)} y2={y(series.expectedIncome)}>
          <title>{`${t('expectedIncome')}: ${money(series.expectedIncome)}`}</title></line>
        <polyline className="accounting-chart-cumulative" data-series="cumulative-costs" points={points} />
        {series.cumulative.map((amount, index) => <circle className="accounting-chart-point" key={months[index]} cx={margin.left + step * (index + .5)} cy={y(amount)} r="4">
          <title>{`${months[index]}: ${money(amount)}`}</title></circle>)}
      </svg>
    </div>
    <table className="visually-hidden"><caption>{t('chartData')}</caption><thead><tr><th>{t('month')}</th><th>{t('expectedIncome')}</th><th>{monthlyLabel}</th><th>{cumulativeLabel}</th></tr></thead>
      <tbody>{months.map((month, index) => <tr key={month}><th scope="row">{month}</th><td>{money(series.expectedIncome)}</td><td>{money(series.monthly[index])}</td><td>{money(series.cumulative[index])}</td></tr>)}</tbody></table>
  </section>;
}
