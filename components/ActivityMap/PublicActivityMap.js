'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { activityCategoryColor, activityCategoryLabel, activityTypeLabel } from '@/lib/activity-map-catalog';

function MapLoading() {
  const { t } = useI18n('activityMap.public');
  return <div className="public-activity-map-loading" role="status">{t('loading')}</div>;
}
const PublicActivityMapView = dynamic(() => import('./PublicActivityMapView'), { ssr: false, loading: MapLoading });

export default function PublicActivityMap({ features }) {
  const { t } = useI18n('activityMap.public');
  const [hiddenCategories, setHiddenCategories] = useState([]);
  const [showAlpineColors, setShowAlpineColors] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const categories = useMemo(() => [...new Map(features.map((feature) => [feature.category, feature])).values()], [features]);
  const visible = useMemo(() => features.filter((feature) => !hiddenCategories.includes(feature.category)), [features, hiddenCategories]);
  const showAlpine = categories.some((feature) => feature.category === 'alpine') && !hiddenCategories.includes('alpine');
  const selected = visible.find((feature) => feature.id === selectedId) || null;

  return <section className="public-activity-section" aria-labelledby="public-activity-map-title">
    <div className="public-activity-heading"><p className="eyebrow">{t('eyebrow')}</p><h2 id="public-activity-map-title">{t('title')}</h2><p>{t('introduction')}</p></div>
    <fieldset className="public-activity-filters"><legend>{t('filters')}</legend>
      {categories.map((feature) => <label key={feature.category}><input type="checkbox" checked={!hiddenCategories.includes(feature.category)} onChange={(event) => setHiddenCategories((current) => event.target.checked
        ? current.filter((category) => category !== feature.category) : [...current, feature.category])} /> <span className="activity-filter-dot" style={{ backgroundColor: activityCategoryColor(feature) }} aria-hidden="true" />{activityCategoryLabel(feature, t)}</label>)}
      {showAlpine && <label><input type="checkbox" checked={showAlpineColors} onChange={(event) => setShowAlpineColors(event.target.checked)} /> {t('showColors')}</label>}
    </fieldset>
    <div className="public-activity-map-shell"><PublicActivityMapView features={visible} showAlpineColors={showAlpineColors} selectedId={selectedId} onSelect={setSelectedId} onError={setError} /></div>
    <div className="public-activity-status" aria-live="polite">{error ? <p className="form-error">{error}</p> : <p>{t('visibleCount', { count: visible.length })}{selected ? ` ${t('selected', { name: selected.activityNumber ? `${selected.activityNumber}. ${selected.name}` : selected.name })}` : ''}</p>}</div>
    <ul className="public-activity-list" aria-label={t('visibleActivities')}>{visible.map((feature) => <li key={feature.id}>
      <button type="button" aria-pressed={selectedId === feature.id} onClick={() => setSelectedId(feature.id)}>
        <span className={`activity-list-symbol is-${feature.alpineColor && showAlpineColors ? feature.alpineColor : 'neutral'}`} style={feature.alpineColor && showAlpineColors ? undefined : { backgroundColor: activityCategoryColor(feature) }} aria-hidden="true" />
        <span><strong>{feature.activityNumber ? `${feature.activityNumber}. ${feature.name}` : feature.name}</strong><small>{activityCategoryLabel(feature, t)} · {activityTypeLabel(feature, t)}{feature.alpineColor && showAlpineColors ? ` · ${t(`colors.${feature.alpineColor}`)}` : ''}</small></span>
      </button></li>)}</ul>
    {!visible.length && <p className="public-activity-empty">{features.length ? t('noCategories') : t('empty')}</p>}
    <p className="public-map-source">{t('source')}</p>
  </section>;
}
