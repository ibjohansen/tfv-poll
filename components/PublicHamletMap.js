'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const PublicHamletMapView = dynamic(() => import('./PublicHamletMapView'), {
  ssr: false,
  loading: () => <div className="public-hamlet-map-loading" role="status">Laster kart …</div>,
});

export default function PublicHamletMap({ hamlets }) {
  const [activeId, setActiveId] = useState('');
  const [showProperties, setShowProperties] = useState(false);
  const [properties, setProperties] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const controllerRef = useRef(null);
  const activeHamlet = useMemo(() => hamlets.find((hamlet) => hamlet.id === activeId) || null, [activeId, hamlets]);

  const loadProperties = useCallback(async (hamletId) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true); setError(''); setProperties([]); setSelectedProperty(null);
    try {
      const response = await fetch(`/api/map/hamlets/${encodeURIComponent(hamletId)}/properties`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || 'Kunne ikke hente eiendommene.');
      setProperties(body.properties || []);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.name === 'TimeoutError' ? 'Kartoppslaget tok for lang tid. Prøv igjen.' : failure.message);
    } finally {
      if (controllerRef.current === controller) { controllerRef.current = null; setLoading(false); }
    }
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  function selectHamlet(hamlet) {
    if (hamlet.id === activeId) {
      controllerRef.current?.abort(); setActiveId(''); setShowProperties(false); setLoading(false);
      setProperties([]); setSelectedProperty(null); setError('');
      return;
    }
    setActiveId(hamlet.id); setProperties([]); setSelectedProperty(null); setError('');
    if (showProperties) loadProperties(hamlet.id);
  }

  function toggleProperties() {
    const next = !showProperties;
    setShowProperties(next); setSelectedProperty(null); setError('');
    if (next && activeId) loadProperties(activeId);
    else { controllerRef.current?.abort(); setLoading(false); setProperties([]); }
  }

  if (!hamlets.length) return <section className="public-hamlet-section" aria-labelledby="public-map-title">
    <div className="public-hamlet-heading"><p className="eyebrow">Turufjell</p><h2 id="public-map-title">Grender og eiendommer</h2><p>Kartet er midlertidig utilgjengelig.</p></div>
  </section>;

  return <section className="public-hamlet-section" aria-labelledby="public-map-title">
    <div className="public-hamlet-heading"><p className="eyebrow">Utforsk området</p><h2 id="public-map-title">Grender og eiendommer</h2>
      <p>Velg en grend for å se området. Eiendomsvisningen viser bare H-nummer, gårds- og bruksnummer og adresse – aldri navn eller kontaktopplysninger.</p></div>
    <div className="public-hamlet-controls" aria-label="Velg grend">
      {hamlets.map((hamlet) => <button key={hamlet.id} type="button" aria-pressed={hamlet.id === activeId}
        title={hamlet.id === activeId ? `Skjul ${hamlet.name} i kartet` : `Vis ${hamlet.name} i kartet`}
        onClick={() => selectHamlet(hamlet)}>{hamlet.name}</button>)}
      <button className="public-property-toggle" type="button" aria-pressed={showProperties} disabled={!activeHamlet || loading}
        title="Vis eller skjul registrerte eiendommer i valgt grend" onClick={toggleProperties}>
        {loading ? 'Henter eiendommer …' : showProperties ? 'Skjul eiendommer' : 'Vis eiendommer'}
      </button>
    </div>
    <PublicHamletMapView hamlets={hamlets} activeHamlet={activeHamlet} properties={showProperties ? properties : []}
      selectedProperty={selectedProperty} onSelectHamlet={selectHamlet} onSelectProperty={setSelectedProperty} onError={setError} />
    <div className="public-hamlet-status" aria-live="polite">
      {error ? <p className="form-error">{error} {showProperties && <button type="button" onClick={() => loadProperties(activeId)} title="Prøv eiendomsoppslaget på nytt">Prøv igjen</button>}</p>
        : showProperties && !loading && <p>{properties.length} offisielle eiendommer med adresse i {activeHamlet?.name}. {selectedProperty && `Valgt: ${selectedProperty.address || selectedProperty.cadastralNumber}. `}{properties.filter((property) => !property.geometry).length > 0 && 'Eiendommer uten kartgeometri vises bare i listen.'}</p>}
    </div>
    {showProperties && properties.length > 0 && <div className="public-property-table" role="region" aria-label={`Eiendommer i ${activeHamlet?.name}`} tabIndex={0}>
      <table><caption>Registrerte eiendommer i {activeHamlet?.name}</caption><thead><tr><th scope="col">H-nummer</th><th scope="col">Gårds- og bruksnummer</th><th scope="col">Adresse</th></tr></thead>
        <tbody>{properties.map((property) => <tr key={property.id} className={selectedProperty?.id === property.id ? 'is-selected' : undefined}
          tabIndex={0} aria-selected={selectedProperty?.id === property.id} title="Vis eiendommen i kartet"
          onClick={() => setSelectedProperty(property)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedProperty(property); } }}>
          <th scope="row"><button type="button" onClick={() => setSelectedProperty(property)} title="Vis eiendommen i kartet">{property.hNumber || '–'}</button></th>
          <td>{property.cadastralNumber || '–'}</td><td>{property.address || 'Ikke registrert'}</td>
        </tr>)}</tbody></table>
    </div>}
    <p className="public-map-source">Grendegrenser: Turufjell Vel. Adressekoordinater og bakgrunnskart: Kartverket.</p>
  </section>;
}
