'use client';

import dynamic from 'next/dynamic';
import Select from '@/components/Select';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useI18n} from '@/components/LocaleProvider';

function MapLoading() {
  const {t} = useI18n('map.public');
  return <div className="public-hamlet-map-loading" role="status">{t('loading')}</div>;
}

const PublicHamletMapView = dynamic(() => import('./PublicHamletMapView'), {
  loading: MapLoading,
  ssr: false,
});

export default function PublicHamletMap({hamlets}) {
  const {t} = useI18n('map.public');
  const [activeId, setActiveId] = useState('');
  const [showProperties, setShowProperties] = useState(false);
  const [hoveredHamletId, setHoveredHamletId] = useState('');
  const [properties, setProperties] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const controllerRef = useRef(null);
  const tableRef = useRef(null);
  const selectedRowRef = useRef(null);
  const activeHamlet = useMemo(() => hamlets.find((hamlet) => hamlet.id === activeId) || null, [activeId, hamlets]);

  const loadProperties = useCallback(async (hamletId) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError('');
    setProperties([]);
    setSelectedProperty(null);
    try {
      const response = await fetch(`/api/map/hamlets/${encodeURIComponent(hamletId)}/properties`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || t('loadError'));
      setProperties(body.properties || []);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.name === 'TimeoutError' ? t('timeout') : failure.message);
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setLoading(false);
      }
    }
  }, [t]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    const table = tableRef.current;
    const row = selectedRowRef.current;
    if (!table || !row) return;
    // Scroll only the table, not the page: keep the map visible after a map click.
    const bounds = table.getBoundingClientRect();
    const selected = row.getBoundingClientRect();
    const headerHeight = table.querySelector('thead')?.getBoundingClientRect().height || 0;
    if (selected.top < bounds.top + headerHeight) table.scrollTop += selected.top - bounds.top - headerHeight;
    else if (selected.bottom > bounds.bottom) table.scrollTop += selected.bottom - bounds.bottom;
  }, [selectedProperty]);

  const selectHamlet = useCallback((hamlet) => {
    if (hamlet.id === activeId) {
      controllerRef.current?.abort();
      setActiveId('');
      setShowProperties(false);
      setHoveredHamletId('');
      setLoading(false);
      setProperties([]);
      setSelectedProperty(null);
      setError('');
      return;
    }
    setActiveId(hamlet.id);
    setProperties([]);
    setSelectedProperty(null);
    setError('');
    setShowProperties(true);
    loadProperties(hamlet.id);
  }, [activeId, loadProperties]);

  function selectHamletFromMenu(hamlet) {
    if (hamlet) selectHamlet(hamlet);
    else if (activeHamlet) selectHamlet(activeHamlet);
  }

  function toggleProperties() {
    const next = !showProperties;
    setShowProperties(next);
    setSelectedProperty(null);
    setError('');
    if (next && activeId) loadProperties(activeId);
    else {
      controllerRef.current?.abort();
      setLoading(false);
      setProperties([]);
    }
  }

  if (!hamlets.length) return <section className="public-hamlet-section" aria-labelledby="public-map-title">
    <div className="public-hamlet-heading"><p className="eyebrow">{t('turufjell')}</p><h2 id="public-map-title">{t('title')}</h2><p>{t('unavailable')}</p></div>
  </section>;

  return <section className="public-hamlet-section" aria-labelledby="public-map-title">
    <div className="public-hamlet-heading"><p className="eyebrow">{t('eyebrow')}</p><h2 id="public-map-title">{t('title')}</h2>
      <p>{t('introduction')}</p></div>
    <div className="public-hamlet-controls" aria-label={t('chooseHamlet')}>
      {hamlets.map((hamlet) => <button key={hamlet.id} type="button" aria-pressed={hamlet.id === activeId}
                                       className={hamlet.id === hoveredHamletId ? 'is-map-hovered' : undefined}
                                       title={hamlet.id === activeId ? t('hideHamlet', {name: hamlet.name}) : t('showHamlet', {name: hamlet.name})}
                                       onClick={() => selectHamlet(hamlet)}>{hamlet.name}</button>)}
    </div>
    <div className="public-hamlet-select">
      <span id="public-hamlet-select-label">{t('chooseHamlet')}</span>
      <Select aria-labelledby="public-hamlet-select-label" value={activeId}
        onChange={(event) => selectHamletFromMenu(hamlets.find((hamlet) => hamlet.id === event.target.value))}>
        <option value="">{t('noHamletSelected')}</option>
        {hamlets.map((hamlet) => <option key={hamlet.id} value={hamlet.id}>{hamlet.name}</option>)}
      </Select>
    </div>
    <div className="public-hamlet-map-mount">
      <PublicHamletMapView hamlets={hamlets} activeHamlet={activeHamlet} properties={showProperties ? properties : []}
                           selectedProperty={selectedProperty} onSelectHamlet={selectHamlet}
                           onSelectProperty={setSelectedProperty} onHoverHamlet={setHoveredHamletId}
                           onError={setError}/>
    </div>
    <div className="public-hamlet-actions">
      <button className="public-property-toggle" type="button" aria-pressed={showProperties}
              disabled={!activeHamlet || loading}
              title={t('propertyToggleHelp')} onClick={toggleProperties}>
        {loading ? t('fetchProperties') : showProperties ? t('hideProperties') : t('showProperties')}
      </button>
      <span>{t('buildingsDefault')}</span>
    </div>
    <div className="public-hamlet-status" aria-live="polite">
      {error ? <p className="form-error">{error} {showProperties &&
          <button type="button" onClick={() => loadProperties(activeId)} title={t('retryTitle')}>{t('retry')}</button>}</p>
        : showProperties && !loading && <p>{t('summary', {count: properties.length, name: activeHamlet?.name})} {selectedProperty && t('selected', {value: selectedProperty.address || selectedProperty.cadastralNumber})} {properties.some((property) => !property.geometry) && t('noGeometry')}</p>}
    </div>
    {showProperties && properties.length > 0 &&
      <div ref={tableRef} className="public-property-table" role="region" aria-label={t('region', {name: activeHamlet?.name})}
           tabIndex={0}>
        <table>
          <caption>{t('caption', {name: activeHamlet?.name})}</caption>
          <thead>
          <tr>
            <th scope="col">{t('hNumber')}</th>
            <th scope="col">{t('cadastral')}</th>
            <th scope="col">{t('address')}</th>
          </tr>
          </thead>
          <tbody>{properties.map((property) => <tr key={property.id}
                                                   ref={selectedProperty?.id === property.id ? selectedRowRef : null}
                                                   className={selectedProperty?.id === property.id ? 'is-selected' : undefined}
                                                   tabIndex={0} aria-selected={selectedProperty?.id === property.id}
                                                   title={t('showInMap')}
                                                   onClick={() => setSelectedProperty(property)} onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setSelectedProperty(property);
            }
          }}>
            <th scope="row">
              <button type="button" onClick={() => setSelectedProperty(property)}
                      aria-pressed={selectedProperty?.id === property.id}
                      title={t('showInMap')}>{property.hNumber || '–'}</button>
            </th>
            <td>{property.cadastralNumber || '–'}</td>
            <td>{property.address || t('notRegistered')}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    <p className="public-map-layer-help">{t('buildingZoomHelp')}</p>
    <p className="public-map-source">{t('source')}</p>
  </section>;
}
