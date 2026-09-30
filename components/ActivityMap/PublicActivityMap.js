'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';

function MapLoading() {
  const { t } = useI18n('activityMap.public');
  return <div className="public-activity-map-loading" role="status">{t('loading')}</div>;
}
const PublicActivityMapView = dynamic(() => import('./PublicActivityMapView'), { ssr: false, loading: MapLoading });

export default function PublicActivityMap({ features }) {
  const { t } = useI18n('activityMap.public');
  const [showCycling, setShowCycling] = useState(true);
  const [showAlpine, setShowAlpine] = useState(true);
  const [showAlpineColors, setShowAlpineColors] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const visible = useMemo(() => features.filter((feature) => (feature.category === 'cycling' ? showCycling : showAlpine)), [features, showAlpine, showCycling]);
  const selected = visible.find((feature) => feature.id === selectedId) || null;

  return <section className="public-activity-section" aria-labelledby="public-activity-map-title">
    <div className="public-activity-heading"><p className="eyebrow">{t('eyebrow')}</p><h2 id="public-activity-map-title">{t('title')}</h2><p>{t('introduction')}</p></div>
    <fieldset className="public-activity-filters"><legend>{t('filters')}</legend>
      <label><input type="checkbox" checked={showCycling} onChange={(event) => setShowCycling(event.target.checked)} /> <span className="activity-filter-dot is-cycling" aria-hidden="true" />{t('categories.cycling')}</label>
      <label><input type="checkbox" checked={showAlpine} onChange={(event) => setShowAlpine(event.target.checked)} /> <span className="activity-filter-dot is-alpine" aria-hidden="true" />{t('categories.alpine')}</label>
      {showAlpine && <label><input type="checkbox" checked={showAlpineColors} onChange={(event) => setShowAlpineColors(event.target.checked)} /> {t('showColors')}</label>}
    </fieldset>
    <div className="public-activity-map-shell"><PublicActivityMapView features={visible} showAlpineColors={showAlpineColors} selectedId={selectedId} onSelect={setSelectedId} onError={setError} /></div>
    <div className="public-activity-status" aria-live="polite">{error ? <p className="form-error">{error}</p> : <p>{t('visibleCount', { count: visible.length })}{selected ? ` ${t('selected', { name: selected.activityNumber ? `${selected.activityNumber}. ${selected.name}` : selected.name })}` : ''}</p>}</div>
    <ul className="public-activity-list" aria-label={t('visibleActivities')}>{visible.map((feature) => <li key={feature.id}>
      <button type="button" aria-pressed={selectedId === feature.id} onClick={() => setSelectedId(feature.id)}>
        <span className={`activity-list-symbol is-${feature.category} is-${feature.category === 'alpine' && showAlpineColors ? feature.alpineColor || 'neutral' : 'neutral'}`} aria-hidden="true" />
        <span><strong>{feature.activityNumber ? `${feature.activityNumber}. ${feature.name}` : feature.name}</strong><small>{t(`categories.${feature.category}`)} · {t(`types.${feature.featureType}`)}{feature.alpineColor && showAlpineColors ? ` · ${t(`colors.${feature.alpineColor}`)}` : ''}</small></span>
      </button></li>)}</ul>
    {!visible.length && <p className="public-activity-empty">{features.length ? t('noCategories') : t('empty')}</p>}
    <p className="public-map-source">{t('source')}</p>
  </section>;
}
