'use client';

import Select from '@/components/Select';
import { useMemo, useState } from 'react';
import { addressLabel, normalizeAddress, propertyLabel, sortAddresses } from '@/lib/map/normalization';
import { useI18n } from '@/components/LocaleProvider';

function ResultTable({ columns, rows, onSelect, caption, selectedId = '' }) {
  const { t } = useI18n('map.admin.results');
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / 100));
  const currentPage = Math.min(page, pages);
  return <div>
    <div className="map-table-scroll" tabIndex={0} role="region" aria-label={caption}><table className="map-results-table">
      <caption>{t('hits', {caption, count: rows.length})}</caption>
      <thead><tr>{columns.map(([title]) => <th key={title} scope="col">{title}</th>)}</tr></thead>
      <tbody>{rows.slice((currentPage - 1) * 100, currentPage * 100).map((row) => <tr key={row.id} className={selectedId === row.id ? 'is-selected' : undefined}>
        {columns.map(([title, render], index) => <td key={title}>{index === 0
          ? <button type="button" className="map-row-link" aria-current={selectedId === row.id ? 'true' : undefined} onClick={() => onSelect(row)}>{render(row) || t('unnamed')}</button>
          : render(row)}</td>)}</tr>)}</tbody>
    </table></div>
    {!rows.length && <p>{t('noHits')}</p>}
    {pages > 1 && <div className="map-actions"><button type="button" className="admin-button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>{t('previous')}</button>
      <span>{t('page', {current: currentPage, total: pages})}</span><button type="button" className="admin-button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>{t('next')}</button></div>}
  </div>;
}

function categoryForStatus(status) {
  if (['CONFLICT', 'MISSING_IN_MAP_DATA'].includes(status)) return 'followUp';
  if (status === 'POSSIBLE_MATCH') return 'possible';
  if (status === 'MISSING_IN_REGISTER') return 'missingRegister';
  return 'noDeviation';
}

export default function ResultsPanel({ addresses, properties, boundaries, roads, comparison, onSelect, onReview, selectedId = '' }) {
  const { t, formatLocale } = useI18n('map.admin');
  const [tab, setTab] = useState('comparison');
  const [filter, setFilter] = useState('');
  const [reviewFilter, setReviewFilter] = useState('followUp');
  const [descending, setDescending] = useState(false);
  const [queue, setQueue] = useState({});
  const search = normalizeAddress(filter);
  const includes = (values) => normalizeAddress(values.filter(Boolean).join(' ')).includes(search);
  const availableTabs = useMemo(() => [comparison && 'comparison', addresses && 'addresses', properties && 'properties', boundaries && 'boundaries', roads && 'roads'].filter(Boolean),
    [addresses, boundaries, comparison, properties, roads]);
  const activeTab = availableTabs.includes(tab) ? tab : availableTabs[0];
  const c = (key) => t(`results.columns.${key}`);

  const categories = comparison ? {
    followUp: comparison.rows.filter((row) => categoryForStatus(row.status) === 'followUp').length,
    possible: comparison.rows.filter((row) => categoryForStatus(row.status) === 'possible').length,
    missingRegister: comparison.rows.filter((row) => categoryForStatus(row.status) === 'missingRegister').length,
    noDeviation: comparison.rows.filter((row) => categoryForStatus(row.status) === 'noDeviation').length,
  } : null;
  const comparisonRows = (comparison?.rows || []).filter((row) => {
    const queueState = queue[row.id] || 'unprocessed';
    const matchesReview = !reviewFilter || reviewFilter === categoryForStatus(row.status)
      || reviewFilter === queueState || (reviewFilter === 'unprocessed' && queueState === 'unprocessed');
    return matchesReview && includes([...row.officialAddresses.map(addressLabel), row.register?.address, row.register?.hNumber, ...row.notes]);
  });
  const selectComparison = (row) => {
    onReview?.();
    onSelect({ ...row, kind: 'comparison', source: t('results.comparisonSource'), feature: row.officialAddresses[0]?.feature });
  };
  const queueControl = (row) => <Select aria-label={t('results.queueFor', {item: row.register?.hNumber || row.id})} value={queue[row.id] || 'unprocessed'}
    onChange={(event) => setQueue((current) => ({ ...current, [row.id]: event.target.value }))}>
    <option value="unprocessed">{t('results.queueUnprocessed')}</option><option value="deferred">{t('results.queueDeferred')}</option><option value="handled">{t('results.queueHandled')}</option>
  </Select>;

  if (!availableTabs.length) return null;
  return <section className="map-results" aria-labelledby="map-results-heading">
    <div className="admin-section-header"><div><p className="eyebrow">{t('results.eyebrow')}</p><h2 id="map-results-heading">{t('results.title')}</h2></div></div>
    {categories && <div className="map-result-summary" aria-label={t('results.summary')}>
      {Object.entries(categories).map(([key, count]) => <button type="button" key={key} aria-pressed={reviewFilter === key} onClick={() => { setTab('comparison'); setReviewFilter(key); onReview?.(); }}>
        <strong>{count}</strong><span>{t(`results.categories.${key}`)}</span></button>)}
    </div>}
    <nav className="map-actions" aria-label={t('results.view')}>{availableTabs.map((key) => <button type="button" className="admin-button" aria-pressed={activeTab === key} key={key} onClick={() => { setTab(key); setFilter(''); }}>{t(`results.tabs.${key}`)}</button>)}</nav>
    <div className="map-result-filters"><label>{t('results.search')} <input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
      {activeTab === 'addresses' && <label>{t('results.sorting')} <Select value={descending ? 'desc' : 'asc'} onChange={(event) => setDescending(event.target.value === 'desc')}><option value="asc">{t('results.asc')}</option><option value="desc">{t('results.desc')}</option></Select></label>}
      {activeTab === 'comparison' && <label>{t('results.followUpFilter')} <Select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)}>
        <option value="">{t('results.allStatuses')}</option><option value="followUp">{t('results.categories.followUp')}</option><option value="possible">{t('results.categories.possible')}</option><option value="missingRegister">{t('results.categories.missingRegister')}</option><option value="noDeviation">{t('results.categories.noDeviation')}</option>
        <option value="unprocessed">{t('results.queueUnprocessed')}</option><option value="deferred">{t('results.queueDeferred')}</option><option value="handled">{t('results.queueHandled')}</option>
      </Select></label>}
    </div>
    {activeTab === 'addresses' && <ResultTable key={`addresses:${filter}:${descending}`} caption={t('results.addressCaption')} rows={sortAddresses(addresses, descending).filter((address) => includes([addressLabel(address), propertyLabel(address), address.postalCode]))} onSelect={onSelect} selectedId={selectedId}
      columns={[[c('address'), addressLabel], [c('cadastral'), propertyLabel], [c('postalCode'), (address) => address.postalCode || '–'], [c('postalPlace'), (address) => address.postalPlace || '–'], [c('source'), (address) => address.source]]} />}
    {activeTab === 'properties' && <><p>{t('results.propertyHelp')}</p><ResultTable key={`properties:${filter}`} caption={t('results.propertyCaption')} rows={properties.filter((property) => includes([property.label, ...property.addresses.map(addressLabel)]))} selectedId={selectedId}
      onSelect={(property) => onSelect({ ...property, kind: 'property', name: property.label })} columns={[[c('cadastral'), (property) => property.label], [c('addresses'), (property) => property.addresses.map(addressLabel).join(' · ')], [c('fnr'), (property) => property.fnr ?? '–'], [c('snr'), (property) => property.snr ?? t('results.unavailable')], [c('source'), (property) => property.source]]} /></>}
    {activeTab === 'boundaries' && <><p>{t('results.boundaryHelp')}</p><ResultTable key={`boundaries:${filter}`} caption={t('results.boundaryCaption')} rows={boundaries.filter((property) => includes([property.name, property.id]))} onSelect={onSelect} selectedId={selectedId}
      columns={[[c('references'), (property) => property.name], [c('accuracy'), (property) => property.accuracy || t('results.unknown')], [c('dispute'), (property) => property.disputed === null ? t('results.unknown') : property.disputed ? t('results.disputeRegistered') : t('results.notFlagged')], [c('multiple'), (property) => property.multipleProperties === null ? t('results.unknown') : property.multipleProperties ? t('results.multipleYes') : t('results.no')], [c('source'), (property) => property.source]]} /></>}
    {activeTab === 'roads' && <ResultTable key={`roads:${filter}`} caption={t('results.roadCaption')} rows={roads.filter((road) => includes([road.name, road.roadType, road.reference]))} onSelect={onSelect} selectedId={selectedId}
      columns={[[c('name'), (road) => road.name || t('results.unnamed')], [c('type'), (road) => road.roadType || '–'], [c('length'), (road) => `${Math.round(road.lengthMeters).toLocaleString(formatLocale)} m`], [c('reference'), (road) => road.reference || '–'], [c('source'), (road) => road.source]]} />}
    {activeTab === 'comparison' && <><p>{comparison.scope} {t('results.comparisonWarning')}</p><ResultTable key={`comparison:${filter}:${reviewFilter}`} caption={t('results.comparisonCaption')} rows={comparisonRows} onSelect={selectComparison} selectedId={selectedId}
      columns={[[c('plot'), (row) => row.register?.hNumber || row.officialAddresses.map(addressLabel).join(' | ') || t('results.addressMissing')],
        [c('source'), () => t('results.comparisonSource')], [c('difference'), (row) => row.notes.join(' ') || t('results.noDifference')],
        [c('confidence'), (row) => t(`results.confidence.${row.status}`)], [c('nextAction'), (row) => t(`results.actions.${row.status}`)], [c('queue'), queueControl]]} />
      {!!comparison.unlocatedRows?.length && <details><summary>{t('results.unlocatedTitle', {count: comparison.unlocatedRows.length})}</summary><p>{t('results.unlocatedHelp')}</p><ResultTable key={`unlocated:${filter}`} caption={t('results.unlocatedCaption')} rows={comparison.unlocatedRows.filter((row) => includes([row.register?.address, row.register?.hNumber, ...row.notes]))}
        onSelect={(row) => onSelect({ ...row, kind: 'comparison', source: t('results.internalSource') })} selectedId={selectedId} columns={[[c('plot'), (row) => row.register?.hNumber || row.register?.address || t('results.addressMissing')], [c('source'), () => t('results.internalSource')], [c('difference'), (row) => row.notes.join(' ')], [c('nextAction'), () => t('results.actions.UNKNOWN')]]} /></details>}
    </>}
  </section>;
}
