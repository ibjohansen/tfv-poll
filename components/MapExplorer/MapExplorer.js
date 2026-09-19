'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import DrawingControls from './DrawingControls';
import { MapError, MAX_VERTICES, validatePolygon } from '@/lib/map/geo';
import { propertiesFromAddresses } from '@/lib/map/kartverket-property-service';
import { requestMap } from '@/lib/map/browser-client';
import { createMapWorkflowState, MAP_PHASES, MAP_TASKS, mapWorkflowReducer } from '@/lib/map/workflow';
import ResultsPanel from './ResultsPanel';
import ObjectDetails from './ObjectDetails';
import HamletControls from './HamletControls';
import MapMemberDetails from './MapMemberDetails';
import { useI18n } from '@/components/LocaleProvider';

function MapLoading() {
  const { t } = useI18n('map.admin');
  return <p role="status">{t('loading')}</p>;
}
const MapView = dynamic(() => import('./MapView'), { ssr: false, loading: MapLoading });

export default function MapExplorer({ canMatrikkelSync = false }) {
  const { t, formatLocale } = useI18n('map.admin');
  const { t: backendT } = useI18n('map.backend');
  const [state, dispatch] = useReducer(mapWorkflowReducer, undefined, createMapWorkflowState);
  const [vertices, setVertices] = useState([]);
  const [layers, setLayers] = useState({ addresses: true, roads: true, register: false, boundaries: false, hamlets: true, buildings: false });
  const [hamlets, setHamlets] = useState([]);
  const [hamletBusy, setHamletBusy] = useState(false);
  const [hamletDirty, setHamletDirty] = useState(false);
  const hamletControlsRef = useRef(null);
  const requestRef = useRef(null);
  const requestSequence = useRef(0);
  const returnMemberId = useRef('');
  const drawing = state.editMode === 'drawing';
  const editing = state.editMode === 'editing';

  useEffect(() => () => requestRef.current?.controller.abort(), []);

  const abortRequest = useCallback(() => {
    requestRef.current?.controller.abort();
    requestRef.current = null;
  }, []);

  const invalidate = useCallback((keepHamlet = false) => {
    abortRequest();
    dispatch({ type: 'area-invalidated', keepHamlet });
  }, [abortRequest]);

  const changeVertices = useCallback((value) => {
    if (value.length > MAX_VERTICES) { dispatch({ type: 'error-set', error: t('maxVertices', {count: MAX_VERTICES}) }); return; }
    invalidate(state.task === MAP_TASKS.HAMLETS);
    setVertices(value);
  }, [invalidate, state.task, t]);

  function beginRequest(busy, notice = '') {
    abortRequest();
    const controller = new AbortController();
    const requestId = ++requestSequence.current;
    requestRef.current = { controller, requestId };
    dispatch({ type: 'fetch-started', requestId, busy, notice });
    return { controller, requestId, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(35_000)]) };
  }

  async function runSource(datatype) {
    if (!state.area || state.editMode) return;
    const request = beginRequest(datatype);
    try {
      const result = await (await requestMap('search', {
        polygon: state.area.polygon, datatype, includeBoundaries: Boolean(state.data.properties),
      }, request.signal, t('requestFailed'))).json();
      if (requestRef.current?.requestId !== request.requestId) return;
      const nextData = datatype === 'properties' ? { ...state.data, properties: result, comparison: null }
        : datatype === 'roads' ? { ...state.data, roads: result }
        : { ...state.data, addresses: result, comparison: datatype === 'comparison' ? result.comparison : null };
      if (datatype === 'properties') setLayers((previous) => ({ ...previous, boundaries: true }));
      const count = datatype === 'properties' ? result.boundaries.length : datatype === 'roads' ? result.roads.length : result.addresses.length;
      const type = t(datatype === 'properties' ? 'parcels' : datatype === 'roads' ? 'roadGroups' : 'officialAddresses');
      dispatch({ type: 'fetch-succeeded', requestId: request.requestId, data: nextData,
        notice: t('fetched', {count, type, mock: result.mockRegister ? t('mock') : ''}) });
    } catch (failure) {
      if (requestRef.current?.requestId !== request.requestId || request.controller.signal.aborted) return;
      dispatch({ type: 'fetch-failed', requestId: request.requestId,
        error: request.signal.aborted ? t('timeout') : failure.message, retry: datatype });
    } finally {
      if (requestRef.current?.requestId === request.requestId) requestRef.current = null;
    }
  }

  async function runRegisterControl() {
    if (!state.area || state.editMode) return;
    const request = beginRequest('comparison', t('fetchingControl'));
    const body = { polygon: state.area.polygon, includeBoundaries: true };
    try {
      const [addressResult, propertyResult] = await Promise.allSettled([
        requestMap('search', { ...body, datatype: 'comparison', hamletId: state.activeHamlet?.id }, request.signal, t('requestFailed')).then((response) => response.json()),
        requestMap('search', { ...body, datatype: 'properties' }, request.signal, t('requestFailed')).then((response) => response.json()),
      ]);
      if (requestRef.current?.requestId !== request.requestId) return;
      if (addressResult.status === 'rejected' && propertyResult.status === 'rejected') throw addressResult.reason;
      const addresses = addressResult.status === 'fulfilled' ? addressResult.value : null;
      const properties = propertyResult.status === 'fulfilled' ? propertyResult.value : null;
      const nextData = { addresses, properties, roads: state.data.roads, comparison: addresses?.comparison || null };
      setLayers((previous) => ({ ...previous, addresses: Boolean(addresses), boundaries: Boolean(properties), register: Boolean(addresses?.comparison) }));
      const counts = [addresses && `${addresses.addresses.length} ${t('addresses')}`, properties && `${properties.boundaries.length} ${t('properties')}`].filter(Boolean).join(' / ');
      const warning = addressResult.status === 'rejected' ? ` ${t('addressesFailed')}` : propertyResult.status === 'rejected' ? ` ${t('propertiesFailed')}` : '';
      dispatch({ type: 'fetch-succeeded', requestId: request.requestId, data: nextData, notice: t('controlReady', {counts, warning}) });
    } catch (failure) {
      if (requestRef.current?.requestId !== request.requestId || request.controller.signal.aborted) return;
      dispatch({ type: 'fetch-failed', requestId: request.requestId,
        error: request.signal.aborted ? t('hamletTimeout') : failure.message, retry: 'control' });
    } finally {
      if (requestRef.current?.requestId === request.requestId) requestRef.current = null;
    }
  }

  function finishArea() {
    try {
      const area = validatePolygon({ type: 'Polygon', coordinates: [[...vertices, vertices[0]]] });
      dispatch({ type: 'area-ready', area, hamlet: state.activeHamlet });
    } catch (failure) {
      dispatch({ type: 'error-set', error: failure instanceof MapError ? backendT(failure.code, failure.values, t('requestFailed')) : failure.message });
    }
  }

  const useHamlet = useCallback((hamlet) => {
    abortRequest();
    const next = hamlet?.polygon ? validatePolygon(hamlet.polygon) : null;
    setVertices(next ? next.polygon.geometry.coordinates[0].slice(0, -1) : []);
    if (!next) dispatch({ type: 'area-cleared' });
    else dispatch({ type: 'area-ready', area: next, hamlet });
  }, [abortRequest]);

  const selectObject = useCallback((item) => {
    if (item.kind === 'hamlet') hamletControlsRef.current?.loadById(String(item.id).replace(/^hamlet:/, ''));
    else dispatch({ type: 'object-selected', selected: { ...item } });
  }, []);

  function changeTask(task) {
    if (task !== state.task) dispatch({ type: 'task-changed', task });
  }

  function changeAreaSource(source) {
    if (source === state.areaSource) return;
    if ((state.area || state.data.comparison) && !window.confirm(t('confirmReplaceArea'))) return;
    abortRequest(); setVertices([]);
    dispatch({ type: 'area-cleared' });
    dispatch({ type: 'area-source-changed', source });
  }

  function cancelRequest() {
    const current = requestRef.current;
    if (!current) return;
    current.controller.abort(); requestRef.current = null;
    dispatch({ type: 'fetch-cancelled', requestId: current.requestId, notice: t('cancelled') });
  }

  function openMember(memberId) {
    returnMemberId.current = String(memberId);
    dispatch({ type: 'member-opened', memberId: String(memberId) });
  }

  function closeMember() {
    const memberId = returnMemberId.current;
    dispatch({ type: 'member-closed' });
    window.setTimeout(() => document.querySelector(`[data-member-opener="${CSS.escape(memberId)}"]`)?.focus());
  }

  const hasResults = Boolean(state.data.addresses || state.data.properties || state.data.roads || state.data.comparison);
  const canRun = Boolean(state.area && !state.editMode && state.phase !== MAP_PHASES.FETCHING);
  const step = state.phase === MAP_PHASES.REVIEWING ? 4 : state.data.comparison ? 3 : state.phase === MAP_PHASES.FETCHING || state.area ? 2 : 1;

  return <div className="map-explorer">
    <header className="map-workflow-header">
      <div><p className="eyebrow">{t('workflow.eyebrow')}</p><h2>{t('workflow.title')}</h2><p>{t('workflow.introduction')}</p></div>
      <div className="map-task-switch" role="group" aria-label={t('workflow.chooseTask')}>
        <button type="button" className="admin-button" aria-pressed={state.task === MAP_TASKS.REGISTER} onClick={() => changeTask(MAP_TASKS.REGISTER)}>{t('workflow.registerTask')}</button>
        <button type="button" className="admin-button" aria-pressed={state.task === MAP_TASKS.HAMLETS} onClick={() => changeTask(MAP_TASKS.HAMLETS)}>{t('workflow.hamletTask')}</button>
      </div>
      {hamletDirty && state.task === MAP_TASKS.REGISTER && <p className="map-warning" role="status">{t('workflow.draftPreserved')}</p>}
    </header>

    <ol className="map-stepper" aria-label={t(state.task === MAP_TASKS.REGISTER ? 'workflow.registerSteps' : 'workflow.hamletSteps')}>
      {[1, 2, 3, 4].map((number) => <li key={number} className={state.task === MAP_TASKS.REGISTER && step === number ? 'is-current' : state.task === MAP_TASKS.REGISTER && step > number ? 'is-complete' : ''} aria-current={state.task === MAP_TASKS.REGISTER && step === number ? 'step' : undefined}>
        <span>{number}</span>{t(state.task === MAP_TASKS.REGISTER ? `workflow.step${number}` : `workflow.hamletStep${number}`)}
      </li>)}
    </ol>

    <div className="map-workspace">
      <aside className="map-control-panel" aria-label={t('workflow.controls')}>
        {state.task === MAP_TASKS.REGISTER && <fieldset className="map-area-source"><legend>{t('workflow.areaChoice')}</legend>
            <label><input type="radio" name="map-area-source" checked={state.areaSource === 'saved'} onChange={() => changeAreaSource('saved')} /> <span><strong>{t('workflow.savedArea')}</strong><small>{t('workflow.recommended')}</small></span></label>
            <label><input type="radio" name="map-area-source" checked={state.areaSource === 'custom'} onChange={() => changeAreaSource('custom')} /> <span><strong>{t('workflow.customArea')}</strong><small>{t('workflow.customAreaHelp')}</small></span></label>
          </fieldset>}
        <div hidden={state.task === MAP_TASKS.REGISTER && state.areaSource === 'custom'}>
          <HamletControls ref={hamletControlsRef} mode={state.task === MAP_TASKS.REGISTER ? 'select' : 'maintain'} polygon={state.area?.polygon} editing={editing} drawing={drawing}
            onUse={useHamlet} onList={setHamlets} onBusy={setHamletBusy} onDirty={setHamletDirty} />
        </div>
        {state.task === MAP_TASKS.REGISTER && state.areaSource === 'custom' && <section className="map-custom-area"><h2>{t('workflow.customArea')}</h2><p>{t('help.searchPolygon')}</p>
          <DrawingControls vertices={vertices} drawing={drawing} editing={editing} onChange={changeVertices} disabled={hamletBusy || state.phase === MAP_PHASES.FETCHING}
            onStart={() => dispatch({ type: 'area-edit-started', mode: 'drawing' })} onFinish={finishArea}
            onEdit={() => { invalidate(); dispatch({ type: 'area-edit-started', mode: 'editing' }); }}
            onDelete={() => { setVertices([]); dispatch({ type: 'area-cleared' }); }} />
        </section>}
        {state.task === MAP_TASKS.REGISTER && state.area && <div className="map-area-summary"><span>{t('workflow.selectedArea')}</span><strong>{state.activeHamlet?.name || t('workflow.customArea')}</strong>
          <small>{Math.round(state.area.areaM2).toLocaleString(formatLocale)} m²</small></div>}
        {state.task === MAP_TASKS.HAMLETS && <section className="map-custom-area"><h2>{t('workflow.boundaryTools')}</h2><p>{t('help.hamletBoundary')}</p>
            <DrawingControls vertices={vertices} drawing={drawing} editing={editing} onChange={changeVertices} disabled={hamletBusy || state.phase === MAP_PHASES.FETCHING}
              onStart={() => dispatch({ type: 'area-edit-started', mode: 'drawing' })} onFinish={finishArea}
              onEdit={() => { invalidate(true); dispatch({ type: 'area-edit-started', mode: 'editing' }); }}
              onDelete={() => { setVertices([]); dispatch({ type: 'area-cleared' }); }} />
          </section>}
      </aside>

      <section className="map-main-panel" aria-label={t('workflow.map')}>
        <div className="map-canvas-shell">
          <MapView vertices={vertices} drawing={drawing} editing={editing} onVerticesChange={changeVertices} layers={layers} selected={state.selected} onSelect={selectObject} onError={(error) => dispatch({ type: 'error-set', error })} hamlets={hamlets}
            addresses={state.data.addresses?.addresses || []} roads={state.data.roads?.roads || []} boundaries={state.data.properties?.boundaries || []}
            registerPoints={(state.data.comparison?.rows || []).filter((row) => row.status === 'MATCH').map((row) => ({
              ...row.officialAddresses[0], id: `register-point:${row.register.id}`, kind: 'register', memberId: row.register.id,
              name: row.register.hNumber, source: t('registerPoint'),
            }))} />
          <details className="map-layer-menu"><summary>{t('layers')}</summary><fieldset><legend className="visually-hidden">{t('layers')}</legend>{[['addresses', t('layerAddresses')], ['roads', t('layerRoads')], ['register', t('layerRegister')], ['boundaries', t('layerProperties')], ['hamlets', t('layerHamlets')], ['buildings', t('layerBuildings')]].map(([key, label]) =>
            <label key={key}><input type="checkbox" checked={layers[key]} onChange={(event) => setLayers({ ...layers, [key]: event.target.checked })} /> {label}</label>)}</fieldset></details>
        </div>
        {state.selected && !state.selectedMemberId && <ObjectDetails key={state.selected.id} selected={state.selected} comparison={state.data.comparison}
          onClose={() => dispatch({ type: 'object-closed' })} onSelect={selectObject} onOpenMember={openMember} />}
        {layers.buildings && <p className="map-source-note" role="status">{t('buildingZoomHelp')}</p>}
        <details className="map-source-details"><summary>{t('workflow.sources')}</summary><p className="map-source-note">{t('source')} <a href="https://www.kartverket.no/api-og-data/eiendomsdata/brukarrettleiing-adresse-api" target="_blank" rel="noreferrer">© Kartverket (CC BY 4.0)</a>.
          {' '}{t('roadsSource')} <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors (ODbL)</a>. {t('internalSource')}</p>
          {state.data.properties && <p className="map-source-note">{t('boundarySource', {date: new Date(state.data.properties.fetchedAt).toLocaleString(formatLocale)})}</p>}
          <p>{t('help.sourcePrivacy')}</p></details>
        {state.task === MAP_TASKS.HAMLETS && state.error && <p className="error-message" role="alert">{state.error}</p>}
      </section>

      {state.task === MAP_TASKS.REGISTER && <section className="map-action-panel" aria-labelledby="map-control-action-title">
        <h2 id="map-control-action-title">{t('workflow.controlAction')}</h2><p>{t('workflow.readOnly')}</p>
        <button type="button" className="primary-button" disabled={!canRun} aria-describedby={!state.area ? 'map-control-disabled-help' : undefined} onClick={runRegisterControl}>{t('workflow.runControl')}</button>
        {!state.area && <p id="map-control-disabled-help" className="muted">{t('workflow.chooseAreaFirst')}</p>}
        <details><summary>{t('workflow.supplementarySources')}</summary><p>{t('workflow.supplementaryHelp')}</p><div className="map-actions">
          <button type="button" className="admin-button" disabled={!canRun} onClick={() => runSource('addresses')}>{t('fetchAddresses')}</button>
          <button type="button" className="admin-button" disabled={!canRun} onClick={() => runSource('roads')}>{t('fetchRoads')}</button>
          <button type="button" className="admin-button" disabled={!canRun} onClick={() => runSource('properties')}>{t('fetchBoundaries')}</button>
        </div></details>
        {state.busy && <div className="map-inline-status"><span role="status">{t('processing')}</span><button type="button" className="admin-button" onClick={cancelRequest}>{t('cancel')}</button></div>}
        {state.error && <p className="error-message" role="alert">{state.error}</p>}
        {state.retry && <button type="button" className="admin-button" disabled={Boolean(state.busy)} onClick={() => state.retry === 'control' ? runRegisterControl() : runSource(state.retry)}>{t('retry')}</button>}
        {state.notice && <p role="status">{state.notice}</p>}
      </section>}

      <section className="map-result-panel" hidden={state.task !== MAP_TASKS.REGISTER} aria-label={t('results.title')}>
        {[...(state.data.addresses?.warnings || []), ...(state.data.roads?.warnings || []), ...(state.data.properties?.warnings || [])].map((warning) => <p key={warning} className="map-warning">{warning}</p>)}
        {state.data.addresses?.fetchedAt && <p className="muted">{t('addressFetched', {date: new Date(state.data.addresses.fetchedAt).toLocaleString(formatLocale)})}</p>}
        <ResultsPanel addresses={state.data.addresses?.addresses} properties={state.data.addresses ? propertiesFromAddresses(state.data.addresses.addresses) : null}
          boundaries={state.data.properties?.boundaries} roads={state.data.roads?.roads} comparison={state.data.comparison}
          selectedId={state.selected?.id} onReview={() => dispatch({ type: 'review-started' })} onSelect={selectObject} />
        {!hasResults && <p>{t('workflow.noResults')}</p>}
      </section>
    </div>

    {state.selectedMemberId && <MapMemberDetails key={state.selectedMemberId} memberId={state.selectedMemberId}
      canMatrikkelSync={canMatrikkelSync} onClose={closeMember} />}
  </div>;
}
