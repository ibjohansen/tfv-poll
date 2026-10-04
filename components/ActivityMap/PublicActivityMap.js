'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { activityCategoryColor, activityCategoryLabel, activityTypeLabel } from '@/lib/activity-map-catalog';
import { ACTIVITY_SEASONS, activityMatchesSeason, activityMatchesTurufjell } from '@/lib/activity-map-display';
import { ACTIVITY_MAP_EXTERNAL_LINKS, ACTIVITY_MAP_SOURCES } from '@/lib/activity-map-sources';

function MapLoading() {
  const { t } = useI18n('activityMap.public');
  return <div className="public-activity-map-loading" role="status">{t('loading')}</div>;
}
const PublicActivityMapView = dynamic(() => import('./PublicActivityMapView'), { ssr: false, loading: MapLoading });

export default function PublicActivityMap({ features }) {
  const { t } = useI18n('activityMap.public');
  const [hiddenCategories, setHiddenCategories] = useState([]);
  const [turufjellOnly, setTurufjellOnly] = useState(true);
  const [showAlpineColors, setShowAlpineColors] = useState(true);
  const [season, setSeason] = useState('all');
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const explorerRef = useRef(null);
  const selectedButtonRef = useRef(null);
  const selectAllCategoriesRef = useRef(null);
  const categories = useMemo(() => [...new Map(features.map((feature) => [feature.category, feature])).values()], [features]);
  const allCategoriesSelected = categories.length > 0 && categories.every((feature) => !hiddenCategories.includes(feature.category));
  const someCategoriesSelected = categories.some((feature) => !hiddenCategories.includes(feature.category));
  const crossCountrySelected = categories.some((feature) => feature.category === 'cross_country') && !hiddenCategories.includes('cross_country');
  const visible = useMemo(() => features.filter((feature) => !hiddenCategories.includes(feature.category)
    && activityMatchesSeason(feature, season)
    && (feature.category !== 'cross_country' || !turufjellOnly
      || activityMatchesTurufjell(feature, { includeManual: true }))), [features, hiddenCategories, season, turufjellOnly]);
  const showAlpine = categories.some((feature) => feature.category === 'alpine') && !hiddenCategories.includes('alpine');
  const selected = visible.find((feature) => feature.id === selectedId) || null;
  const visibleSources = useMemo(() => [...new Set(visible.flatMap((feature) => feature.sources || []).map((source) => source.id))]
    .map((id) => ACTIVITY_MAP_SOURCES[id]).filter(Boolean), [visible]);

  useEffect(() => {
    setFullscreenSupported(Boolean(explorerRef.current?.requestFullscreen && document.exitFullscreen));
    const handleFullscreen = () => setIsFullscreen(document.fullscreenElement === explorerRef.current);
    document.addEventListener('fullscreenchange', handleFullscreen);
    return () => document.removeEventListener('fullscreenchange', handleFullscreen);
  }, []);

  useEffect(() => {
    if (selected) selectedButtonRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  useEffect(() => {
    if (selectAllCategoriesRef.current) selectAllCategoriesRef.current.indeterminate = someCategoriesSelected && !allCategoriesSelected;
  }, [allCategoriesSelected, someCategoriesSelected]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === explorerRef.current) await document.exitFullscreen();
      else await explorerRef.current?.requestFullscreen();
    } catch { setError(t('fullscreenError')); }
  }

  return <section className="public-activity-section" aria-labelledby="public-activity-map-title">
    <div className="public-activity-heading"><p className="eyebrow">{t('eyebrow')}</p><h2 id="public-activity-map-title">{t('title')}</h2><p>{t('introduction')}</p></div>
    <div ref={explorerRef} className="public-activity-explorer">
      <div className="public-activity-toolbar">
        <fieldset className="public-activity-filters"><legend>{t('filters')}</legend>
          <label className="is-select-all"><input ref={selectAllCategoriesRef} type="checkbox" checked={allCategoriesSelected} onChange={(event) => {
            setHiddenCategories(event.target.checked ? [] : categories.map((feature) => feature.category));
          }} />{t('selectAll')}</label>
          {categories.map((feature) => <label key={feature.category}><input type="checkbox" checked={!hiddenCategories.includes(feature.category)} onChange={(event) => {
              const checked = event.target.checked;
              setHiddenCategories((current) => checked ? current.filter((category) => category !== feature.category) : [...current, feature.category]);
            }} /> <span className="activity-filter-dot" style={{ backgroundColor: activityCategoryColor(feature) }} aria-hidden="true" />{activityCategoryLabel(feature, t)}</label>)}
          {crossCountrySelected && <label className="is-primary-filter"><input type="checkbox" checked={turufjellOnly} onChange={(event) => setTurufjellOnly(event.target.checked)} />{t('filterTurufjell')}</label>}
          {showAlpine && <label><input type="checkbox" checked={showAlpineColors} onChange={(event) => setShowAlpineColors(event.target.checked)} /> {t('showColors')}</label>}
        </fieldset>
        <label className="activity-season-filter">{t('season')}<select value={season} onChange={(event) => setSeason(event.target.value)}>
          <option value="all">{t('allSeasons')}</option>{ACTIVITY_SEASONS.map((value) => <option key={value} value={value}>{t(`seasons.${value}`)}</option>)}
        </select></label>
      </div>
      {fullscreenSupported && <button type="button" className="public-map-fullscreen" aria-pressed={isFullscreen} aria-label={isFullscreen ? t('exitFullscreen') : t('enterFullscreen')} title={isFullscreen ? t('exitFullscreen') : t('enterFullscreen')} onClick={toggleFullscreen}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={isFullscreen ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5'} /></svg>
      </button>}
      <div className="public-activity-explorer-body">
        <div className="public-activity-map-shell"><PublicActivityMapView features={visible} showAlpineColors={showAlpineColors} selectedId={selectedId} isFullscreen={isFullscreen} onSelect={setSelectedId} onError={setError} /></div>
        <div className="public-activity-panel">
          <div className="public-activity-status" aria-live="polite">{error ? <p className="form-error">{error}</p> : <p>{t('visibleCount', { count: visible.length })}{selected ? ` ${t('selected', { name: selected.activityNumber ? `${selected.activityNumber}. ${selected.name}` : selected.name })}` : ''}</p>}</div>
          {selected && <section className="activity-selected-details" aria-label={t('activityDetails')}>
            <h3>{selected.activityNumber ? `${selected.activityNumber}. ${selected.name}` : selected.name}</h3>
            {selected.season && <p>{t(`seasons.${selected.season}`)}</p>}
            {selected.tooltipText && <p>{selected.tooltipText}</p>}
            {selected.sources?.map((source) => <p key={source.id}>{t('sourceLabel', { source: source.name })}</p>)}
            {selected.websiteUrl && <a href={selected.websiteUrl} target="_blank" rel="noopener noreferrer">{t('visitWebsite')}</a>}
          </section>}
          <ul className="public-activity-list" aria-label={t('visibleActivities')}>{visible.map((feature) => <li key={feature.id}>
            <button ref={selectedId === feature.id ? selectedButtonRef : null} type="button" aria-pressed={selectedId === feature.id} onClick={() => setSelectedId(feature.id)}>
              <span className={`activity-list-symbol is-${feature.alpineColor && showAlpineColors ? feature.alpineColor : 'neutral'}`} style={feature.alpineColor && showAlpineColors ? undefined : { backgroundColor: activityCategoryColor(feature) }} aria-hidden="true" />
              <span><strong>{feature.activityNumber ? `${feature.activityNumber}. ${feature.name}` : feature.name}</strong><small>{activityCategoryLabel(feature, t)} · {activityTypeLabel(feature, t)}{feature.alpineColor && showAlpineColors ? ` · ${t(`colors.${feature.alpineColor}`)}` : ''}</small></span>
            </button></li>)}</ul>
          {!visible.length && <p className="public-activity-empty">{features.length ? t('noCategories') : t('empty')}</p>}
          <p className="public-map-source">{t('source')}{visibleSources.length ? <> {t('trailDataAttribution')}: {visibleSources.map((source, index) => <span key={source.id}>{index ? ' · ' : ''}
            <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">© {source.name}</a> (<a href={source.licenseUrl} target="_blank" rel="noopener noreferrer">{source.licenseName}</a>)</span>)}</> : null}</p>
        </div>
      </div>
    </div>
    <section className="public-activity-external" aria-labelledby="more-cross-country-trails"><h3 id="more-cross-country-trails">{t('moreTrails')}</h3>
      <p>{t('externalLinksHelp')}</p><ul>{ACTIVITY_MAP_EXTERNAL_LINKS.map((link) => <li key={link.id}><a href={link.url} target="_blank" rel="noopener noreferrer">{t(`externalLinks.${link.id}`)}</a></li>)}</ul>
    </section>
  </section>;
}
