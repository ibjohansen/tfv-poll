'use client';

import dynamic from 'next/dynamic';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useI18n} from '@/components/LocaleProvider';

function MapLoading() {
  const {t} = useI18n('map.public');
  return <div className="public-hamlet-map-loading" role="status">{t('loading')}</div>;
}

const PublicHamletMapView = dynamic(() => import('./PublicHamletMapView'), {
  ssr: false,
  loading: MapLoading,
});

export default function PublicHamletMap({hamlets}) {
  const {t} = useI18n('map.public');
  const [activeId, setActiveId] = useState('');
  const [showProperties, setShowProperties] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [properties, setProperties] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const controllerRef = useRef(null);
  const mapMount = useRef(null);
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
    if (mapReady || !mapMount.current) return undefined;
    if (!('IntersectionObserver' in window)) {
      const timer = window.setTimeout(() => setMapReady(true), 0);
      return () => window.clearTimeout(timer);
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setMapReady(true);
      observer.disconnect();
    }, {rootMargin: '400px 0px'});
    observer.observe(mapMount.current);
    return () => observer.disconnect();
  }, [mapReady]);

  function selectHamlet(hamlet) {
    if (hamlet.id === activeId) {
      controllerRef.current?.abort();
      setActiveId('');
      setShowProperties(false);
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
    if (showProperties) loadProperties(hamlet.id);
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
                                       title={hamlet.id === activeId ? t('hideHamlet', {name: hamlet.name}) : t('showHamlet', {name: hamlet.name})}
                                       onClick={() => selectHamlet(hamlet)}>{hamlet.name}</button>)}
    </div>
    <div ref={mapMount} className="public-hamlet-map-mount">
      {mapReady ? <PublicHamletMapView hamlets={hamlets} activeHamlet={activeHamlet} properties={showProperties ? properties : []}
                         selectedProperty={selectedProperty} onSelectHamlet={selectHamlet}
                         onSelectProperty={setSelectedProperty} onError={setError}/> : <MapLoading />}
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
      <div className="public-property-table" role="region" aria-label={t('region', {name: activeHamlet?.name})}
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
