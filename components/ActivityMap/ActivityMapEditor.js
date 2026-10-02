'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { ACTIVITY_SEASONS, ALPINE_COLORS, normalizeActivityNumber } from '@/lib/activity-map';
import { activityCatalogLabel, activityCategoryLabel, activityTypeLabel, findActivityType, withActivityCatalog } from '@/lib/activity-map-catalog';
import ActivityMapCatalogManager from './ActivityMapCatalogManager';

function MapLoading() {
  const { t } = useI18n('activityMap.admin');
  return <p role="status">{t('loading')}</p>;
}
const ActivityMapEditorView = dynamic(() => import('./ActivityMapEditorView'), { ssr: false, loading: MapLoading });

const emptyDraft = () => ({ id: null, version: null, name: '', tooltipText: '', season: '', websiteUrl: '', category: 'cycling', activityNumber: '', featureType: 'trail', alpineColor: '', geometry: null, isDraft: true });

const geometryType = { polygon: 'Polygon', line: 'LineString', point: 'Point' };

function compareFeatures(a, b) {
  if (a.isDraft !== b.isDraft) return a.isDraft ? -1 : 1;
  if (a.category !== b.category) return a.category.localeCompare(b.category);
  if (a.featureType !== b.featureType) return a.featureType.localeCompare(b.featureType);
  if (a.activityNumber !== b.activityNumber) return (a.activityNumber || '').localeCompare(b.activityNumber || '', 'nb', { numeric: true, sensitivity: 'base' });
  return a.name.localeCompare(b.name, 'nb', { numeric: true });
}

export default function ActivityMapEditor() {
  const { t } = useI18n('activityMap.admin');
  const [features, setFeatures] = useState([]);
  const [catalog, setCatalog] = useState({ categories: [], types: [] });
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [draft, setDraft] = useState(emptyDraft);
  const [drawing, setDrawing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const controllerRef = useRef(null);
  const mapFrameRef = useRef(null);

  const selected = useMemo(() => features.find((feature) => feature.id === draft.id) || null, [draft.id, features]);
  const decoratedFeatures = useMemo(() => features.map((feature) => withActivityCatalog(feature, catalog)), [features, catalog]);
  const filteredFeatures = useMemo(() => categoryFilter === 'all' ? decoratedFeatures : decoratedFeatures.filter((feature) => feature.category === categoryFilter), [categoryFilter, decoratedFeatures]);
  const mapLabels = useMemo(() => ({
    canvas: t('mapCanvasLabel'), zoomIn: t('zoomIn'), zoomOut: t('zoomOut'), tileError: t('tileError'),
    geometryPoint: (number) => t('geometryPoint', { number }), addGeometryPoint: t('addGeometryPoint'),
    removeGeometryPoint: (number) => t('removeGeometryPoint', { number }), activityPoint: t('activityPoint'), baseMap: t('baseMap'),
    topographicMap: t('topographicMap'), satelliteMap: t('satelliteMap'),
  }), [t]);

  const request = useCallback(async (options = {}) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const response = await fetch('/api/admin/activity-map/features', {
      credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      ...options, headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.message || t('requestError'));
    return body;
  }, [t]);

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

  function selectFeature(feature) {
    if ((drawing || editing) && !window.confirm(t('confirmDiscard'))) return;
    setDraft({ ...feature, activityNumber: feature.activityNumber == null ? '' : String(feature.activityNumber), alpineColor: feature.alpineColor || '' });
    setDrawing(false); setEditing(false); setError(''); setNotice('');
  }

  function newFeature() {
    if ((draft.geometry || draft.name) && !window.confirm(t('confirmDiscard'))) return;
    setDraft(emptyDraft()); setDrawing(false); setEditing(false); setError(''); setNotice('');
  }

  function changeCategory(category) {
    setDraft((current) => {
      const type = findActivityType(catalog, category, current.featureType) || catalog.types.find((item) => item.category === category);
      const expected = geometryType[type?.geometryKind];
      return { ...current, category, featureType: type?.id || '', activityNumber: category === 'alpine' ? current.activityNumber : '',
        alpineColor: category === 'alpine' && type?.id === 'trail' ? current.alpineColor : '',
        geometry: current.geometry?.type === expected ? current.geometry : null };
    });
    setDrawing(false); setEditing(false);
  }

  function changeType(featureType) {
    const expected = geometryType[findActivityType(catalog, draft.category, featureType)?.geometryKind];
    setDraft((current) => ({ ...current, featureType, alpineColor: featureType === 'trail' ? current.alpineColor : '',
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
        featureType: draft.featureType, alpineColor: draft.alpineColor || null, geometry: draft.geometry, isDraft: draft.isDraft,
        season: draft.season || null, websiteUrl: draft.websiteUrl || null };
      const { feature } = await request({ method: 'POST', body: JSON.stringify(payload) });
      setFeatures((current) => [...current.filter((item) => item.id !== feature.id), feature]
        .sort(compareFeatures));
      setDraft({ ...feature, activityNumber: feature.activityNumber == null ? '' : String(feature.activityNumber), alpineColor: feature.alpineColor || '' });
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

  const kind = findActivityType(catalog, draft.category, draft.featureType)?.geometryKind;
  const expectedGeometry = geometryType[kind];
  let numberValid = true;
  try { normalizeActivityNumber(draft.activityNumber, draft.category); } catch { numberValid = draft.activityNumber === ''; }
  const geometryValid = !draft.geometry || draft.geometry.type === expectedGeometry;
  const canSave = kind && draft.name.trim() && numberValid && geometryValid && (draft.isDraft || draft.geometry?.type === expectedGeometry) && !drawing && !editing && !busy;
  const canFinish = kind === 'polygon' ? (draft.geometry?.coordinates?.[0]?.length || 0) >= 3
    : kind === 'line' ? (draft.geometry?.coordinates?.length || 0) >= 2 : Boolean(draft.geometry);

  return <div className="activity-admin">
    <header className="activity-admin-heading"><p className="eyebrow">{t('eyebrow')}</p><h2>{t('title')}</h2><p>{t('introduction')}</p></header>
    <ActivityMapCatalogManager catalog={catalog} onChange={setCatalog} disabled={busy || !catalog.categories.length} />
    <div className="activity-admin-layout">
      <aside className="activity-feature-list" aria-label={t('savedFeatures')}>
        <div className="activity-feature-list-heading"><h3>{t('savedFeatures')}</h3><button type="button" className="admin-button" onClick={newFeature}>{t('new')}</button></div>
        <label className="activity-category-filter">{t('filterCategory')}<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">{t('allCategories')}</option>{catalog.categories.map((item) => <option key={item.id} value={item.id}>{activityCatalogLabel(item, 'categories', t)}</option>)}
        </select></label>
        {busy && !features.length ? <p role="status">{t('loading')}</p> : filteredFeatures.length ? <ul>{filteredFeatures.map((feature) => <li key={feature.id}>
          <button type="button" aria-pressed={draft.id === feature.id} onClick={() => selectFeature(feature)}>
            <strong>{feature.activityNumber ? `${feature.activityNumber}. ${feature.name}` : feature.name}</strong><span>{activityCategoryLabel(feature, t)} · {activityTypeLabel(feature, t)}{feature.isDraft ? ` · ${t('draft')}` : ''}</span>
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
          <label>{t('season')}<select value={draft.season || ''} onChange={(event) => setDraft((current) => ({ ...current, season: event.target.value }))}>
            <option value="">{t('noSeason')}</option>{ACTIVITY_SEASONS.map((season) => <option key={season} value={season}>{t(`seasons.${season}`)}</option>)}
          </select></label>
          <label className="activity-tooltip-field">{t('website')}<input type="url" maxLength={2048} placeholder="https://" value={draft.websiteUrl || ''} onChange={(event) => setDraft((current) => ({ ...current, websiteUrl: event.target.value }))} /></label>
        </div>
        {!catalog.types.some((item) => item.category === draft.category) && !busy && <p className="muted">{t('catalog.noTypes')}</p>}
        <label className="activity-draft-toggle"><input type="checkbox" checked={draft.isDraft} onChange={(event) => setDraft((current) => ({ ...current, isDraft: event.target.checked }))} /><span><strong>{t('saveAsDraft')}</strong><small>{t('draftHelp')}</small></span></label>
        <div className="activity-drawing-actions" role="group" aria-label={t('geometryTools')}>
          <button type="button" className="admin-button" disabled={busy || drawing || !kind} onClick={startDrawing}>{t(kind === 'polygon' ? 'drawPolygon' : kind === 'line' ? 'drawLine' : 'placePoint')}</button>
          {drawing && <button type="button" className="admin-button primary" disabled={!canFinish} onClick={finishDrawing}>{t('finish')}</button>}
          {!drawing && draft.geometry && <button type="button" className="admin-button" onClick={() => setEditing((value) => !value)}>{editing ? t('finishEditing') : t('editGeometry')}</button>}
          {draft.geometry && <button type="button" className="admin-button" onClick={clearGeometry}>{t('clearGeometry')}</button>}
        </div>
        <p className="muted">{t(kind === 'polygon' ? 'polygonHelp' : kind === 'line' ? 'lineHelp' : 'pointHelp')}</p>
        <div ref={mapFrameRef} className="activity-admin-map-frame"><ActivityMapEditorView features={filteredFeatures} draft={{ ...draft, geometryKind: kind }} drawing={drawing} editing={editing}
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
