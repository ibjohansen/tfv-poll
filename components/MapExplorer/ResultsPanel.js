'use client';

import { useState } from 'react';
import { addressLabel, normalizeAddress, propertyLabel, sortAddresses } from '@/lib/map/normalization';
import { COMPARISON_STATUSES } from '@/lib/map/comparison';
import { useI18n } from '@/components/LocaleProvider';

function ResultTable({ columns, rows, onSelect, caption }) {
  const { t } = useI18n('map.admin.results');
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / 100));
  const currentPage = Math.min(page, pages);
  return <div>
    <div className="map-table-scroll" tabIndex={0} role="region" aria-label={caption}><table className="map-results-table">
      <caption>{t('hits', {caption, count: rows.length})}</caption>
      <thead><tr>{columns.map(([title]) => <th key={title} scope="col">{title}</th>)}</tr></thead>
      <tbody>{rows.slice((currentPage - 1) * 100, currentPage * 100).map((row) => <tr key={row.id}>{columns.map(([title, render], index) =>
        <td key={title}>{index === 0 ? <button type="button" className="map-row-link" onClick={() => onSelect(row)}>{render(row) || t('unnamed')}</button> : render(row)}</td>)}</tr>)}</tbody>
    </table></div>
    {!rows.length && <p>{t('noHits')}</p>}
    {pages > 1 && <div className="map-actions"><button type="button" className="admin-button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>{t('previous')}</button>
      <span>{t('page', {current: currentPage, total: pages})}</span><button type="button" className="admin-button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>{t('next')}</button></div>}
  </div>;
}

export default function ResultsPanel({ addresses, properties, boundaries, roads, comparison, onSelect }) {
  const { t, formatLocale } = useI18n('map.admin');
  const [tab, setTab] = useState('addresses');
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState('');
  const [descending, setDescending] = useState(false);
  const search = normalizeAddress(filter);
  const includes = (values) => normalizeAddress(values.filter(Boolean).join(' ')).includes(search);
  const tabs = ['addresses', 'properties', 'boundaries', 'roads', 'comparison'];
  const c = (key) => t(`results.columns.${key}`);
  return <section className="map-results" aria-label={t('results.title')}>
    <nav className="map-actions" aria-label={t('results.view')}>{tabs.map((key) => <button type="button" className="admin-button" aria-pressed={tab === key} key={key} onClick={() => { setTab(key); setFilter(''); }}>{t(`results.tabs.${key}`)}</button>)}</nav>
    <div className="map-actions"><label>{t('results.search')} <input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
      {tab === 'addresses' && <label>{t('results.sorting')} <select value={descending ? 'desc' : 'asc'} onChange={(event) => setDescending(event.target.value === 'desc')}><option value="asc">{t('results.asc')}</option><option value="desc">{t('results.desc')}</option></select></label>}
      {tab === 'comparison' && <label>{t('results.status')} <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">{t('results.allStatuses')}</option>{COMPARISON_STATUSES.map((value) => <option key={value} value={value}>{t(`statuses.${value}`, {}, value)}</option>)}</select></label>}
    </div>
    {tab === 'addresses' && (addresses ? <ResultTable key={`addresses:${filter}:${descending}`} caption={t('results.addressCaption')} rows={sortAddresses(addresses, descending).filter((a) => includes([addressLabel(a), propertyLabel(a), a.postalCode]))} onSelect={onSelect}
      columns={[[c('address'), addressLabel], [c('cadastral'), propertyLabel], [c('postalCode'), (a) => a.postalCode || '–'], [c('postalPlace'), (a) => a.postalPlace || '–'], [c('source'), (a) => a.source]]} /> : <p>{t('results.fetchAddresses')}</p>)}
    {tab === 'properties' && <><p>{t('results.propertyHelp')}</p><ResultTable key={`properties:${filter}`} caption={t('results.propertyCaption')} rows={(properties || []).filter((p) => includes([p.label, ...p.addresses.map(addressLabel)]))}
      onSelect={(p) => onSelect({ ...p, kind: 'property', name: p.label })} columns={[[c('cadastral'), (p) => p.label], [c('addresses'), (p) => p.addresses.map(addressLabel).join(' · ')], [c('fnr'), (p) => p.fnr ?? '–'], [c('snr'), (p) => p.snr ?? t('results.unavailable')], [c('source'), (p) => p.source]]} /></>}
    {tab === 'boundaries' && (boundaries ? <><p>{t('results.boundaryHelp')}</p><ResultTable key={`boundaries:${filter}`} caption={t('results.boundaryCaption')} rows={boundaries.filter((p) => includes([p.name, p.id]))} onSelect={onSelect}
      columns={[[c('references'), (p) => p.name], [c('accuracy'), (p) => p.accuracy || t('results.unknown')], [c('dispute'), (p) => p.disputed === null ? t('results.unknown') : p.disputed ? t('results.disputeRegistered') : t('results.notFlagged')], [c('multiple'), (p) => p.multipleProperties === null ? t('results.unknown') : p.multipleProperties ? t('results.multipleYes') : t('results.no')], [c('source'), (p) => p.source]]} /></> : <p>{t('results.fetchBoundaries')}</p>)}
    {tab === 'roads' && (roads ? <ResultTable key={`roads:${filter}`} caption={t('results.roadCaption')} rows={roads.filter((r) => includes([r.name, r.roadType, r.reference]))} onSelect={onSelect}
      columns={[[c('name'), (r) => r.name || t('results.unnamed')], [c('type'), (r) => r.roadType || '–'], [c('length'), (r) => `${Math.round(r.lengthMeters).toLocaleString(formatLocale)} m`], [c('reference'), (r) => r.reference || '–'], [c('source'), (r) => r.source]]} /> : <p>{t('results.fetchRoads')}</p>)}
    {tab === 'comparison' && (comparison ? <><p>{comparison.scope} {t('results.comparisonWarning')}</p><ResultTable key={`comparison:${filter}:${status}`} caption={t('results.comparisonCaption')} rows={comparison.rows.filter((r) => (!status || r.status === status) && includes([...r.officialAddresses.map(addressLabel), r.register?.address, r.register?.hNumber, ...r.notes]))}
      onSelect={(row) => onSelect({ ...row, kind: 'comparison', source: 'Turufjell Vel / Kartverket', feature: row.officialAddresses[0]?.feature })}
      columns={[[c('officialAddress'), (r) => r.officialAddresses.map(addressLabel).join(' | ') || r.register?.address || t('results.addressMissing')], [c('hNumber'), (r) => r.register?.hNumber || '–'], [c('registerAddress'), (r) => r.register?.address || '–'], [c('mapCadastral'), (r) => r.officialAddresses.map(propertyLabel).join(' | ') || '–'], [c('registerCadastral'), (r) => r.register ? propertyLabel(r.register) : '–'], [t('results.status'), (r) => <span className={`map-status is-${r.status.toLowerCase()}`}>{r.status}<br />{t(`statuses.${r.status}`, {}, r.status)}</span>], [c('note'), (r) => r.notes.join(' ')]]} />
      {!!comparison.unlocatedRows?.length && <section aria-label={t('results.unlocated')}><h3>{t('results.unlocatedTitle', {count: comparison.unlocatedRows.length})}</h3><p>{t('results.unlocatedHelp')}</p><ResultTable key={`unlocated:${filter}`} caption={t('results.unlocatedCaption')} rows={comparison.unlocatedRows.filter((r) => includes([r.register?.address, r.register?.hNumber, ...r.notes]))}
        onSelect={(row) => onSelect({ ...row, kind: 'comparison', source: 'Turufjell Vel' })} columns={[[c('registerAddress'), (r) => r.register?.address || t('results.addressMissing')], [c('hNumber'), (r) => r.register?.hNumber || '–'], [c('registerCadastral'), (r) => propertyLabel(r.register)], [c('note'), (r) => r.notes.join(' ')]]} /></section>}
    </> : <p>{t('results.fetchComparison')}</p>)}
  </section>;
}
