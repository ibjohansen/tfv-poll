'use client';
/* Activity images are already resized and converted to WebP before storage. */
/* eslint-disable @next/next/no-img-element */

import { useApiClient } from '@/components/useApiClient';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { ACTIVITY_SEASONS, ALPINE_COLORS, activityMatchesTurufjell, normalizeActivityNumber } from '@/lib/activity-map-display';
import { activityCatalogLabel, activityCategoryLabel, activityMapIconOverrideValue, activitySubtypeLabel, activityTypeLabel, findActivityType, withActivityCatalog } from '@/lib/activity-map-catalog';
import { activityMapIconKind, activityMapIconMarkup } from '@/lib/activity-map-icons';
import ActivityMapCatalogManager from './ActivityMapCatalogManager';
import ActivityMapImportPanel from './ActivityMapImportPanel';
import { ACTIVITY_MAP_SOURCE_IDS, ACTIVITY_MAP_SOURCES } from '@/lib/activity-map-sources';

function MapLoading() {
  const { t } = useI18n('activityMap.admin');
  return <p role="status">{t('loading')}</p>;
}
const ActivityMapEditorView = dynamic(() => import('./ActivityMapEditorView'), { ssr: false, loading: MapLoading });

const emptyDraft = () => ({ id: null, version: null, name: '', tooltipText: '', season: '', websiteUrl: '', imageUrl: null, imageSourceUrl: null, imageCredit: '', iconOverride: '', category: 'cycling', activityNumber: '', featureType: 'trail', featureSubtype: '', alpineColor: '', geometry: null, isDraft: true });

const geometryType = { polygon: 'Polygon', line: 'LineString', point: 'Point' };

function compareFeatures(a, b) {
  if (a.isDraft !== b.isDraft) return a.isDraft ? -1 : 1;
  if (a.category !== b.category) return a.category.localeCompare(b.category);
  if (a.featureType !== b.featureType) return a.featureType.localeCompare(b.featureType);
  if (a.activityNumber !== b.activityNumber) return (a.activityNumber || '').localeCompare(b.activityNumber || '', 'nb', { numeric: true, sensitivity: 'base' });
  return a.name.localeCompare(b.name, 'nb', { numeric: true });
}

export default function ActivityMapEditor({ initialImportRunId = null }) {
  const apiFetch = useApiClient();
  const { t } = useI18n('activityMap.admin');
  const [features, setFeatures] = useState([]);
  const [catalog, setCatalog] = useState({ categories: [], types: [] });
  const [hiddenCategories, setHiddenCategories] = useState([]);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [turufjellOnly, setTurufjellOnly] = useState(false);
  const [previewCandidates, setPreviewCandidates] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [drawing, setDrawing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(true);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState('');
  const [imageNotice, setImageNotice] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const controllerRef = useRef(null);
  const mapFrameRef = useRef(null);
  const selectedFeatureButtonRef = useRef(null);
  const selectAllCategoriesRef = useRef(null);
  const imageFileRef = useRef(null);
  const imageSourceUrlRef = useRef(null);

  const selected = useMemo(() => features.find((feature) => feature.id === draft.id) || null, [draft.id, features]);
  const iconChoices = useMemo(() => [
    ...catalog.categories.filter((item) => item.iconUrl).map((item) => ({
      value: activityMapIconOverrideValue('category', item), label: `${t('iconGroups.category')}: ${activityCatalogLabel(item, 'categories', t)}`,
      feature: { category: item.id, categoryName: item.name, iconUrl: item.iconUrl },
    })),
    ...catalog.types.filter((item) => item.iconUrl).map((item) => ({
      value: activityMapIconOverrideValue('type', item), label: `${t('iconGroups.type')}: ${activityCatalogLabel(catalog.categories.find((category) => category.id === item.category) || { id: item.category, name: item.category }, 'categories', t)} – ${activityCatalogLabel(item, 'types', t)}`,
      feature: { category: item.category, featureType: item.id, typeName: item.name, iconUrl: item.iconUrl },
    })),
    ...(catalog.subtypes || []).filter((item) => item.iconUrl).map((item) => ({
      value: activityMapIconOverrideValue('subtype', item), label: `${t('iconGroups.subtype')}: ${activitySubtypeLabel({ category: item.category, featureType: item.featureType, featureSubtype: item.id, subtypeName: item.name }, t)}`,
      feature: { category: item.category, featureType: item.featureType, featureSubtype: item.id, subtypeName: item.name, iconUrl: item.iconUrl },
    })),
  ], [catalog, t]);
  const selectedIconChoice = iconChoices.find((choice) => choice.value === draft.iconOverride) || null;
  const decoratedFeatures = useMemo(() => features.map((feature) => withActivityCatalog(feature, catalog)), [features, catalog]);
  const filteredFeatures = useMemo(() => decoratedFeatures.filter((feature) => {
    const sourceMatches = sourceFilter === 'all' || (sourceFilter === 'manual' && !feature.sources?.length)
      || feature.sources?.some((source) => source.id === sourceFilter);
    return !hiddenCategories.includes(feature.category) && sourceMatches
      && (!turufjellOnly || activityMatchesTurufjell(feature, { includeManual: true }));
  }), [decoratedFeatures, hiddenCategories, sourceFilter, turufjellOnly]);
  const allCategoriesSelected = catalog.categories.length > 0 && catalog.categories.every((item) => !hiddenCategories.includes(item.id));
  const someCategoriesSelected = catalog.categories.some((item) => !hiddenCategories.includes(item.id));
  const mapLabels = useMemo(() => ({
    canvas: t('mapCanvasLabel'), zoomIn: t('zoomIn'), zoomOut: t('zoomOut'), tileError: t('tileError'),
    geometryPoint: (number) => t('geometryPoint', { number }), addGeometryPoint: t('addGeometryPoint'),
    removeGeometryPoint: (number) => t('removeGeometryPoint', { number }), activityPoint: t('activityPoint'), baseMap: t('baseMap'),
    topographicMap: t('topographicMap'), satelliteMap: t('satelliteMap'),
    photoCredit: (credit) => t('photoCredit', { credit }),
    importPreview: ({ name, source }) => t('import.previewMapLabel', { name, source }),
  }), [t]);

  const request = useCallback(async (options = {}) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const response = await apiFetch('/api/admin/activity-map/features', {
      credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      ...options, headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.message || t('requestError'));
    return body;
  }, [apiFetch, t]);

  const loadFeatures = useCallback(async () => {
    const body = await request();
    setFeatures([...(body.features || [])].sort(compareFeatures));
    setCatalog(body.catalog);
  }, [request]);

  useEffect(() => {
    let active = true;
    request().then((body) => { if (active) { setFeatures([...(body.features || [])].sort(compareFeatures)); setCatalog(body.catalog); } })
      .catch((failure) => { if (active && failure.name !== 'AbortError') setError(failure.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; controllerRef.current?.abort(); };
  }, [request]);

  useEffect(() => {
    setFullscreenSupported(Boolean(mapFrameRef.current?.requestFullscreen && document.exitFullscreen));
    const handleFullscreen = () => setIsFullscreen(document.fullscreenElement === mapFrameRef.current);
    document.addEventListener('fullscreenchange', handleFullscreen);
    return () => document.removeEventListener('fullscreenchange', handleFullscreen);
  }, []);

  useEffect(() => {
    if (draft.id) selectedFeatureButtonRef.current?.scrollIntoView({ block: 'nearest' });
  }, [draft.id, filteredFeatures]);

  useEffect(() => {
    if (selectAllCategoriesRef.current) selectAllCategoriesRef.current.indeterminate = someCategoriesSelected && !allCategoriesSelected;
  }, [allCategoriesSelected, someCategoriesSelected]);

  function selectFeature(feature) {
    if ((drawing || editing) && !window.confirm(t('confirmDiscard'))) return;
    setDraft({ ...feature, activityNumber: feature.activityNumber == null ? '' : String(feature.activityNumber), featureSubtype: feature.featureSubtype || '', alpineColor: feature.alpineColor || '', iconOverride: feature.iconOverride || '' });
    if (imageSourceUrlRef.current) imageSourceUrlRef.current.value = feature.imageSourceUrl || '';
    if (imageFileRef.current) imageFileRef.current.value = '';
    setDrawing(false); setEditing(false); setError(''); setNotice(''); setImageError(''); setImageNotice('');
  }

  function newFeature() {
    if ((draft.geometry || draft.name) && !window.confirm(t('confirmDiscard'))) return;
    setDraft(emptyDraft()); setDrawing(false); setEditing(false); setError(''); setNotice(''); setImageError(''); setImageNotice('');
    if (imageSourceUrlRef.current) imageSourceUrlRef.current.value = '';
    if (imageFileRef.current) imageFileRef.current.value = '';
  }

  function changeCategory(category) {
    setDraft((current) => {
      const type = findActivityType(catalog, category, current.featureType) || catalog.types.find((item) => item.category === category);
      const expected = geometryType[type?.geometryKind];
      return { ...current, category, featureType: type?.id || '', featureSubtype: '', activityNumber: category === 'alpine' ? current.activityNumber : '',
        alpineColor: category === 'alpine' && type?.id === 'trail' ? current.alpineColor : '',
        geometry: current.geometry?.type === expected ? current.geometry : null };
    });
    setDrawing(false); setEditing(false);
  }

  function changeType(featureType) {
    const expected = geometryType[findActivityType(catalog, draft.category, featureType)?.geometryKind];
    setDraft((current) => ({ ...current, featureType, featureSubtype: '', alpineColor: featureType === 'trail' ? current.alpineColor : '',
      geometry: current.geometry?.type === expected ? current.geometry : null }));
    setDrawing(false); setEditing(false);
  }

  function startDrawing() {
    setDraft((current) => ({ ...current, geometry: null }));
    setDrawing(true);
    setEditing(false);
  }

  function finishDrawing() {
    if (kind === 'polygon') {
      setDraft((current) => {
        const ring = current.geometry.coordinates[0];
        return { ...current, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } };
      });
    }
    setDrawing(false);
  }

  function clearGeometry() {
    setDraft((current) => ({ ...current, geometry: null }));
    setDrawing(false);
    setEditing(false);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === mapFrameRef.current) await document.exitFullscreen();
      else await mapFrameRef.current?.requestFullscreen();
    } catch { setError(t('fullscreenError')); }
  }

  async function save() {
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = { action: draft.id ? 'update' : 'create', id: draft.id, version: draft.version,
        name: draft.name, tooltipText: draft.tooltipText || null, category: draft.category, activityNumber: draft.category === 'alpine' && draft.activityNumber !== '' ? draft.activityNumber : null,
        featureType: draft.featureType, featureSubtype: draft.featureSubtype || null, alpineColor: draft.alpineColor || null, geometry: draft.geometry, isDraft: draft.isDraft,
        season: draft.season || null, websiteUrl: draft.websiteUrl || null, imageCredit: draft.imageCredit || null, iconOverride: draft.iconOverride || null };
      const { feature } = await request({ method: 'POST', body: JSON.stringify(payload) });
      setFeatures((current) => [...current.filter((item) => item.id !== feature.id), feature]
        .sort(compareFeatures));
      setDraft({ ...feature, activityNumber: feature.activityNumber == null ? '' : String(feature.activityNumber), featureSubtype: feature.featureSubtype || '', alpineColor: feature.alpineColor || '', iconOverride: feature.iconOverride || '' });
      setDrawing(false); setEditing(false); setNotice(t('saved', { name: feature.name }));
    } catch (failure) { if (failure.name !== 'AbortError') setError(failure.message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!draft.id || !window.confirm(t('confirmDelete', { name: draft.name }))) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request({ method: 'POST', body: JSON.stringify({ action: 'delete', id: draft.id, version: draft.version }) });
      setFeatures((current) => current.filter((feature) => feature.id !== draft.id));
      setDraft(emptyDraft()); setDrawing(false); setEditing(false); setNotice(t('deleted'));
    } catch (failure) { if (failure.name !== 'AbortError') setError(failure.message); }
    finally { setBusy(false); }
  }

  function applyImageFeature(feature) {
    setFeatures((current) => [...current.filter((item) => item.id !== feature.id), feature].sort(compareFeatures));
    setDraft((current) => current.id === feature.id ? {
      ...current, version: feature.version, imageUrl: feature.imageUrl, imageSourceUrl: feature.imageSourceUrl,
    } : current);
    if (imageSourceUrlRef.current) imageSourceUrlRef.current.value = feature.imageSourceUrl || '';
  }

  async function updateImage(mode) {
    if (!draft.id) return;
    setImageBusy(true); setImageError(''); setImageNotice('');
    try {
      const form = new FormData();
      form.set('id', draft.id); form.set('version', String(draft.version));
      if (mode === 'file') {
        const file = imageFileRef.current?.files?.[0];
        if (!file) throw new Error(t('imageChooseFile'));
        form.set('file', file);
      } else form.set('sourceUrl', imageSourceUrlRef.current?.value || '');
      const response = await apiFetch('/api/admin/activity-map/features/image', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', body: form,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || t('requestError'));
      applyImageFeature(body.feature);
      setImageNotice(t('imageUpdated'));
    } catch (failure) { setImageError(failure.message || t('requestError')); }
    finally {
      if (mode === 'file' && imageFileRef.current) imageFileRef.current.value = '';
      setImageBusy(false);
    }
  }

  async function removeImage() {
    if (!draft.id || !draft.imageUrl) return;
    setImageBusy(true); setImageError(''); setImageNotice('');
    try {
      const response = await apiFetch('/api/admin/activity-map/features/image', {
        method: 'DELETE', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: draft.id, version: draft.version }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || t('requestError'));
      applyImageFeature(body.feature);
      setImageNotice(t('imageRemoved'));
    } catch (failure) { setImageError(failure.message || t('requestError')); }
    finally { setImageBusy(false); }
  }

  const kind = findActivityType(catalog, draft.category, draft.featureType)?.geometryKind;
  const subtypes = (catalog.subtypes || []).filter((item) => item.category === draft.category && item.featureType === draft.featureType);
  const expectedGeometry = geometryType[kind];
  let numberValid = true;
  try { normalizeActivityNumber(draft.activityNumber, draft.category); } catch { numberValid = draft.activityNumber === ''; }
  const geometryValid = !draft.geometry || draft.geometry.type === expectedGeometry;
  const canSave = kind && draft.name.trim() && numberValid && geometryValid && (draft.isDraft || draft.geometry?.type === expectedGeometry) && !drawing && !editing && !busy && !imageBusy;
  const canFinish = kind === 'polygon' ? (draft.geometry?.coordinates?.[0]?.length || 0) >= 3
    : kind === 'line' ? (draft.geometry?.coordinates?.length || 0) >= 2 : Boolean(draft.geometry);

  return <div className="activity-admin">
    <header className="activity-admin-heading"><p className="eyebrow">{t('eyebrow')}</p><h2>{t('title')}</h2><p>{t('introduction')}</p></header>
    <ActivityMapCatalogManager catalog={catalog} onChange={setCatalog} disabled={busy || !catalog.categories.length} />
    <ActivityMapImportPanel disabled={busy} initialRunId={initialImportRunId} onApplied={loadFeatures} onPreviewChange={setPreviewCandidates} />
    <div className="activity-admin-layout">
      <aside className="activity-feature-list" aria-label={t('savedFeatures')}>
        <div className="activity-feature-list-heading"><h3>{t('savedFeatures')}</h3><button type="button" className="admin-button" onClick={newFeature}>{t('new')}</button></div>
        <fieldset className="activity-admin-category-filters"><legend>{t('filterCategory')}</legend>
          <label className="is-select-all"><input ref={selectAllCategoriesRef} type="checkbox" checked={allCategoriesSelected} onChange={(event) => {
            setHiddenCategories(event.target.checked ? [] : catalog.categories.map((item) => item.id));
          }} /><span>{t('selectAll')}</span></label>
          {catalog.categories.map((item) => <label key={item.id}><input type="checkbox" checked={!hiddenCategories.includes(item.id)} onChange={(event) => {
            const checked = event.target.checked;
            setHiddenCategories((current) => checked ? current.filter((category) => category !== item.id) : [...current, item.id]);
          }} /><span>{activityCatalogLabel(item, 'categories', t)}</span></label>)}
        </fieldset>
        <label className="activity-category-filter">{t('filterSource')}<select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
          <option value="all">{t('allSources')}</option><option value="manual">{t('manualSource')}</option>
          {ACTIVITY_MAP_SOURCE_IDS.map((id) => <option key={id} value={id}>{ACTIVITY_MAP_SOURCES[id].name}</option>)}
        </select></label>
        <label className="activity-checkbox-filter"><input type="checkbox" checked={turufjellOnly} onChange={(event) => setTurufjellOnly(event.target.checked)} /><span>{t('filterTurufjell')}</span></label>
        {busy && !features.length ? <p role="status">{t('loading')}</p> : filteredFeatures.length ? <ul>{filteredFeatures.map((feature) => <li key={feature.id}>
          <button ref={draft.id === feature.id ? selectedFeatureButtonRef : null} type="button" aria-pressed={draft.id === feature.id} onClick={() => selectFeature(feature)}>
            <strong>{feature.activityNumber ? `${feature.activityNumber}. ${feature.name}` : feature.name}</strong><span>{activityCategoryLabel(feature, t)} · {activityTypeLabel(feature, t)}{feature.featureSubtype ? ` · ${activitySubtypeLabel(feature, t)}` : ''}{feature.isDraft ? ` · ${t('draft')}` : ''}</span>
          </button></li>)}</ul> : <p className="muted">{t('empty')}</p>}
      </aside>
      <section className="activity-editor-panel" aria-labelledby="activity-editor-title">
        <h3 id="activity-editor-title">{draft.id ? t('editTitle', { name: selected?.name || draft.name }) : t('createTitle')}</h3>
        <div className="activity-form-grid">
          <label>{t('category')}<select value={draft.category} onChange={(event) => changeCategory(event.target.value)}>{catalog.categories.map((item) => <option key={item.id} value={item.id}>{activityCatalogLabel(item, 'categories', t)}</option>)}</select></label>
          <label>{t('name')}<input maxLength={160} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
          <label className="activity-tooltip-field">{t('tooltipText')}<input maxLength={300} value={draft.tooltipText || ''} onChange={(event) => setDraft((current) => ({ ...current, tooltipText: event.target.value }))} /></label>
          {draft.category === 'alpine' && <label>{t('number')}<input maxLength={24} inputMode="text" autoComplete="off" value={draft.activityNumber} onChange={(event) => setDraft((current) => ({ ...current, activityNumber: event.target.value }))} /></label>}
          {draft.category === 'alpine' && draft.featureType === 'trail' && <label>{t('color')}<select value={draft.alpineColor} onChange={(event) => setDraft((current) => ({ ...current, alpineColor: event.target.value }))}>
            <option value="">{t('noColor')}</option>{ALPINE_COLORS.map((color) => <option key={color} value={color}>{t(`colors.${color}`)}</option>)}
          </select></label>}
          <label>{t('type')}<select value={draft.featureType} onChange={(event) => changeType(event.target.value)}>
            {!kind && <option value="">{t('catalog.selectType')}</option>}{catalog.types.filter((item) => item.category === draft.category).map((item) => <option key={item.id} value={item.id}>{activityCatalogLabel(item, 'types', t)}</option>)}
          </select></label>
          {subtypes.length > 0 && <label>{t('subtype')}<select value={draft.featureSubtype} onChange={(event) => setDraft((current) => ({ ...current, featureSubtype: event.target.value }))}>
            <option value="">{t('noSubtype')}</option>{subtypes.map((item) => <option key={item.id} value={item.id}>{activitySubtypeLabel({ ...draft, featureSubtype: item.id, subtypeName: item.name }, t)}</option>)}
          </select></label>}
          <div className="activity-icon-override-field"><label>{t('iconOverride')}<select value={draft.iconOverride || ''} onChange={(event) => setDraft((current) => ({ ...current, iconOverride: event.target.value }))}>
            <option value="">{t('iconAutomatic')}</option>{iconChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
          </select></label>{selectedIconChoice && <span className={`activity-catalog-icon-preview is-${activityMapIconKind(selectedIconChoice.feature)}`} aria-label={t('iconPreview')}
            dangerouslySetInnerHTML={{ __html: activityMapIconMarkup(selectedIconChoice.feature) }} />}<small>{t('iconOverrideHelp')}</small></div>
          <label>{t('season')}<select value={draft.season || ''} onChange={(event) => setDraft((current) => ({ ...current, season: event.target.value }))}>
            <option value="">{t('noSeason')}</option>{ACTIVITY_SEASONS.map((season) => <option key={season} value={season}>{t(`seasons.${season}`)}</option>)}
          </select></label>
          <label className="activity-tooltip-field">{t('website')} <input type="url" maxLength={2048} placeholder="https://" value={draft.websiteUrl || ''} onChange={(event) => setDraft((current) => ({ ...current, websiteUrl: event.target.value }))} /></label>
        </div>
        <section className="activity-image-editor" aria-labelledby="activity-image-title">
          <h4 id="activity-image-title">{t('imageTitle')}</h4>
          {draft.imageUrl && <div className="activity-image-preview"><img src={draft.imageUrl} alt={t('imagePreviewAlt', { name: draft.name })} /><button type="button" className="admin-button danger" disabled={busy || imageBusy} onClick={removeImage}>{t('removeImage')}</button></div>}
          <label>{t('imageCredit')} <input maxLength={160} value={draft.imageCredit || ''} placeholder={t('imageCreditPlaceholder')}
            onChange={(event) => setDraft((current) => ({ ...current, imageCredit: event.target.value }))} /></label>
          {draft.id ? <div className="activity-image-inputs">
            <div className="activity-image-upload-action"><input ref={imageFileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy || imageBusy}
              onChange={(event) => { if (event.target.files?.[0]) updateImage('file'); }} /><button type="button" className="admin-button" disabled={busy || imageBusy}
                onClick={() => imageFileRef.current?.click()}>{imageBusy ? t('imageUploading') : t('uploadImage')}</button><small>{t('imageFile')}</small></div>
            <div><label>{t('imageUrl')} <input ref={imageSourceUrlRef} type="url" maxLength={2048} placeholder="https://" defaultValue={draft.imageSourceUrl || ''} disabled={busy || imageBusy} /></label><button type="button" className="admin-button" disabled={busy || imageBusy} onClick={() => updateImage('url')}>{t('importImage')}</button></div>
            <p className="muted">{t('imageHelp')}</p>
          </div> : <p className="muted">{t('imageSaveFirst')}</p>}
          {imageError && <p className="error-message" role="alert">{imageError}</p>}{imageNotice && <p role="status">{imageNotice}</p>}
        </section>
        {!catalog.types.some((item) => item.category === draft.category) && !busy && <p className="muted">{t('catalog.noTypes')}</p>}
        <label className="activity-draft-toggle"><input type="checkbox" checked={draft.isDraft} onChange={(event) => setDraft((current) => ({ ...current, isDraft: event.target.checked }))} /><span><strong>{t('saveAsDraft')}</strong><small>{t('draftHelp')}</small></span></label>
        <div className="activity-drawing-actions" role="group" aria-label={t('geometryTools')}>
          <button type="button" className="admin-button" disabled={busy || drawing || !kind} onClick={startDrawing}>{t(kind === 'polygon' ? 'drawPolygon' : kind === 'line' ? 'drawLine' : 'placePoint')}</button>
          {drawing && <button type="button" className="admin-button primary" disabled={!canFinish} onClick={finishDrawing}>{t('finish')}</button>}
          {!drawing && draft.geometry && <button type="button" className="admin-button" onClick={() => setEditing((value) => !value)}>{editing ? t('finishEditing') : t('editGeometry')}</button>}
          {draft.geometry && <button type="button" className="admin-button" onClick={clearGeometry}>{t('clearGeometry')}</button>}
        </div>
        <p className="muted">{t(kind === 'polygon' ? 'polygonHelp' : kind === 'line' ? 'lineHelp' : 'pointHelp')}</p>
        <div ref={mapFrameRef} className="activity-admin-map-frame"><ActivityMapEditorView features={filteredFeatures} previewFeatures={previewCandidates} draft={{ ...withActivityCatalog(draft, catalog), geometryKind: kind }} drawing={drawing} editing={editing}
          onSelect={selectFeature} onGeometryChange={(geometry) => setDraft((current) => ({ ...current, geometry }))} onError={setError} labels={mapLabels} />
          <div className="activity-map-floating-actions">
            {isFullscreen && !drawing && <button type="button" className="admin-button" disabled={busy || !kind} onClick={startDrawing}>{t(kind === 'polygon' ? 'drawPolygon' : kind === 'line' ? 'drawLine' : 'placePoint')}</button>}
            {isFullscreen && drawing && <button type="button" className="admin-button primary" disabled={!canFinish} onClick={finishDrawing}>{t('finish')}</button>}
            {isFullscreen && !drawing && draft.geometry && <button type="button" className="admin-button" onClick={() => setEditing((value) => !value)}>{editing ? t('finishEditing') : t('editGeometry')}</button>}
            {fullscreenSupported && <button type="button" className="activity-map-fullscreen" title={isFullscreen ? t('exitFullscreen') : t('enterFullscreen')} onClick={toggleFullscreen}>
              <span className="visually-hidden">{isFullscreen ? t('exitFullscreen') : t('enterFullscreen')}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">{isFullscreen ? <path d="M9 3v6H3m12-6v6h6M9 21v-6H3m12 6v-6h6" /> : <path d="M9 3H3v6m12-6h6v6M9 21H3v-6m12 6h6v-6" />}</svg>
            </button>}
          </div>
        </div>
        <div className="activity-save-row"><button type="button" className="primary-button" disabled={!canSave} onClick={save}>{busy ? t('saving') : t('save')}</button>
          {draft.id && <button type="button" className="admin-button danger" disabled={busy} onClick={remove}>{t('delete')}</button>}</div>
        {!draft.isDraft && !draft.geometry && <p className="error-message">{t('publishNeedsGeometry')}</p>}
        {error && <p className="error-message" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      </section>
    </div>
  </div>;
}
