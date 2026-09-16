'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import DrawingControls from './DrawingControls';
import { MAX_VERTICES, validatePolygon } from '@/lib/map/geo';
import { propertiesFromAddresses } from '@/lib/map/kartverket-property-service';
import { STATUS_LABELS } from '@/lib/map/comparison';
import { memberIdsForSelection } from '@/lib/map/selection';
import { requestMap } from '@/lib/map/browser-client';
import ResultsPanel from './ResultsPanel';
import ObjectDetails from './ObjectDetails';
import HamletControls from './HamletControls';
import MapMemberDetails from './MapMemberDetails';

const MapView = dynamic(() => import('./MapView'), { ssr: false, loading: () => <p role="status">Laster kart …</p> });

export default function MapExplorer({ canMatrikkelSync = false }) {
  const [vertices, setVertices] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [area, setArea] = useState(null);
  const [error, setError] = useState('');
  const [layers, setLayers] = useState({ addresses: true, roads: true, register: false, boundaries: false, hamlets: true });
  const [hamlets, setHamlets] = useState([]);
  const [activeHamlet, setActiveHamlet] = useState(null);
  const [hamletBusy, setHamletBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [data, setData] = useState({ addresses: null, roads: null, properties: null, comparison: null });
  const hamletControlsRef = useRef(null);
  const selectObject = useCallback((item) => {
    if (item.kind === 'hamlet') hamletControlsRef.current?.loadById(String(item.id).replace(/^hamlet:/, ''));
    else {
      setSelected({ ...item });
      const memberIds = memberIdsForSelection(item, data.comparison);
      setSelectedMemberId(memberIds.length === 1 ? memberIds[0] : null);
    }
  }, [data.comparison]);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(null);
  const requestRef = useRef(null);
  useEffect(() => () => requestRef.current?.abort(), []);
  const invalidate = useCallback(() => {
    requestRef.current?.abort(); requestRef.current = null;
    setData({ addresses: null, roads: null, properties: null, comparison: null }); setSelected(null); setSelectedMemberId(null); setBusy(''); setNotice(''); setRetry(null);
  }, []);
  const changeVertices = useCallback((value) => {
    if (value.length > MAX_VERTICES) { setError(`Maksimalt ${MAX_VERTICES} hjørner.`); return; }
    invalidate();
    setVertices(value); setArea(null); setError('');
  }, [invalidate]);

  async function run(datatype) {
    if (!area || editing || drawing) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(datatype); setError(''); setNotice(''); setRetry(null);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(35_000)]);
    try {
      const result = await (await requestMap('search', { polygon: area.polygon, datatype, includeBoundaries: Boolean(data.properties) }, signal)).json();
      if (requestRef.current !== controller) return;
      setSelected(null); setSelectedMemberId(null);
      setData((previous) => datatype === 'properties' ? { ...previous, properties: result, comparison: null }
        : datatype === 'roads' ? { ...previous, roads: result }
        : { ...previous, addresses: result, comparison: datatype === 'comparison' ? result.comparison : null });
      if (datatype === 'properties') setLayers((previous) => ({ ...previous, boundaries: true }));
      setNotice(`${datatype === 'properties' ? result.boundaries.length + ' teiger' : datatype === 'roads' ? result.roads.length + ' veigrupper' : result.addresses.length + ' offisielle adresser'} hentet.${result.mockRegister ? ' Sammenlignet med syntetisk testregister.' : ''}`);
    } catch (failure) {
      if (requestRef.current !== controller || controller.signal.aborted) return;
      setError(signal.aborted ? 'Søket tok for lang tid. Prøv igjen eller tegn et mindre område.' : failure.message);
      setRetry({ datatype });
    } finally { if (requestRef.current === controller) { setBusy(''); requestRef.current = null; } }
  }

  function finish() {
    try {
      setArea(validatePolygon({ type: 'Polygon', coordinates: [[...vertices, vertices[0]]] }));
      setDrawing(false); setEditing(false); setError('');
    } catch (failure) { setError(failure.message); }
  }

  const loadHamletData = useCallback(async (polygon, hamletId) => {
    requestRef.current?.abort();
    const controller = new AbortController(); requestRef.current = controller;
    setBusy('hamlet'); setError(''); setNotice('Henter adresser og eiendommer i grenden …'); setRetry(null);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(35_000)]);
    const body = { polygon, includeBoundaries: true };
    try {
      const [addressResult, propertyResult] = await Promise.allSettled([
        requestMap('search', { ...body, datatype: 'comparison', hamletId }, signal).then((response) => response.json()),
        requestMap('search', { ...body, datatype: 'properties' }, signal).then((response) => response.json()),
      ]);
      if (requestRef.current !== controller) return;
      if (addressResult.status === 'rejected' && propertyResult.status === 'rejected') throw addressResult.reason;
      const addresses = addressResult.status === 'fulfilled' ? addressResult.value : null;
      const properties = propertyResult.status === 'fulfilled' ? propertyResult.value : null;
      setData({ addresses, properties, roads: null, comparison: addresses?.comparison || null });
      setLayers((previous) => ({ ...previous, addresses: Boolean(addresses), boundaries: Boolean(properties) }));
      const counts = [addresses && `${addresses.addresses.length} adresser`, properties && `${properties.boundaries.length} eiendommer`].filter(Boolean).join(' og ');
      const warning = addressResult.status === 'rejected' ? ' Adressene kunne ikke hentes.' : propertyResult.status === 'rejected' ? ' Eiendommene kunne ikke hentes.' : '';
      setNotice(`${counts} er koblet til grenden.${warning}`);
    } catch (failure) {
      if (requestRef.current !== controller || controller.signal.aborted) return;
      setError(signal.aborted ? 'Oppslaget for grenden tok for lang tid. Prøv igjen.' : failure.message);
    } finally { if (requestRef.current === controller) { setBusy(''); requestRef.current = null; } }
  }, []);

  const useHamlet = useCallback((hamlet) => {
    invalidate(); setActiveHamlet(hamlet || null); setDrawing(false); setEditing(false); setError('');
    const next = hamlet?.polygon ? validatePolygon(hamlet.polygon) : null;
    setVertices(next ? next.polygon.geometry.coordinates[0].slice(0, -1) : []);
    setArea(next);
    if (next) {
      setSelected({ ...hamlet, id: `hamlet:${hamlet.id}`, kind: 'hamlet', feature: hamlet.polygon });
      loadHamletData(next.polygon, hamlet.id);
    }
  }, [invalidate, loadHamletData]);

  return <div className="map-explorer">
    <p>Kontroller Turufjell vels register mot offisielle adresser. Hent bare data for området du tegner. Kartkildene mottar ikke medlemsopplysninger.</p>
    <details className="map-search-polygon"><summary><span>Søkepolygon</span><small>{area ? `${Math.round(area.areaM2).toLocaleString('nb-NO')} m²` : 'Tegn eller rediger et område'}</small></summary><div>
      <DrawingControls vertices={vertices} drawing={drawing} editing={editing} onChange={changeVertices} disabled={hamletBusy}
        onStart={() => setDrawing(true)} onFinish={finish} onEdit={() => { invalidate(); setEditing(true); }}
        onDelete={() => { changeVertices([]); setDrawing(false); setEditing(false); setSelected(null); setSelectedMemberId(null); }} />
      <p aria-live="polite">{area ? `Areal: ${Math.round(area.areaM2).toLocaleString('nb-NO')} m² (${area.areaKm2.toLocaleString('nb-NO', { maximumFractionDigits: 3 })} km²)` : 'Ingen ferdig søkepolygon.'}</p>
    </div></details>
    {data.comparison && <div className="map-summary" aria-label="Nøkkeltall">
      <div><strong>{data.comparison.officialCount}</strong><span>Offisielle adresser i polygon</span></div>
      <div><strong>{data.comparison.registerCount}</strong><span>{data.comparison.registerScope === 'hamlet' ? 'Registrerte tomter i valgt grend' : 'Aktive poster i hele registeret'}</span></div>
      <div><strong>{data.comparison.unlocatedRows?.length || 0}</strong><span>Ukjent plassering · utenfor mangeltall</span></div>
      {Object.entries(data.comparison.counts).map(([status, count]) => <div key={status}><strong>{count}</strong><span>{STATUS_LABELS[status]}</span></div>)}
    </div>}
    <HamletControls ref={hamletControlsRef} polygon={area?.polygon} drawing={drawing} editing={editing} onUse={useHamlet} onList={setHamlets} onBusy={setHamletBusy}>
      <MapView vertices={vertices} drawing={drawing} editing={editing} onVerticesChange={changeVertices} layers={layers} selected={selected} onSelect={selectObject} onError={setError} hamlets={hamlets}
        addresses={data.addresses?.addresses || []} roads={data.roads?.roads || []} boundaries={data.properties?.boundaries || []}
        registerPoints={(data.comparison?.rows || []).filter((r) => r.status === 'MATCH').map((r) => ({
          ...r.officialAddresses[0], id: `register-point:${r.register.id}`, kind: 'register', memberId: r.register.id,
          name: r.register.hNumber, source: 'Turufjell vel · plassering fra Kartverket',
        }))} />
    </HamletControls>
    {error && <p className="error-message" role="alert">{error}</p>}
    {retry && <button type="button" className="admin-button" disabled={Boolean(busy)} onClick={() => run(retry.datatype)}>Prøv igjen</button>}
    <div className="map-actions">
      <button type="button" className="admin-button primary" disabled={!area || drawing || editing || Boolean(busy)} onClick={() => run('addresses')}>Hent adresser</button>
      <button type="button" className="admin-button" disabled={!area || drawing || editing || Boolean(busy)} onClick={() => run('roads')}>Hent veier og stier</button>
      <button type="button" className="admin-button" disabled={!area || drawing || editing || Boolean(busy)} onClick={() => run('properties')}>Hent eiendomsgrenser</button>
      <button type="button" className="admin-button" disabled={!area || drawing || editing || Boolean(busy) || data.addresses?.complete === false} onClick={() => run('comparison')}>Sammenlign register</button>
      {busy && <><span role="status">Henter og behandler data …</span><button type="button" className="admin-button" onClick={() => { requestRef.current?.abort(); requestRef.current = null; setBusy(''); setNotice('Forespørselen er avbrutt.'); }}>Avbryt</button></>}
    </div>
    {notice && <p role="status">{notice}</p>}
    <fieldset className="map-layer-controls"><legend>Kartlag</legend>{[['addresses', 'Adresser'], ['roads', 'Veier'], ['register', 'Medlemsregister'], ['boundaries', 'Eiendommer'], ['hamlets', 'Grendegrenser']].map(([key, label]) =>
      <label key={key}><input type="checkbox" checked={layers[key]} onChange={(event) => setLayers({ ...layers, [key]: event.target.checked })} /> {label}</label>)}
    </fieldset>
    <p className="map-source-note">Bakgrunn og offisielle adresser: <a href="https://www.kartverket.no/api-og-data/eiendomsdata/brukarrettleiing-adresse-api" target="_blank" rel="noreferrer">© Kartverket (CC BY 4.0)</a>.
      {' '}Veier/stier: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors (ODbL)</a>. Interne registerfelt: Turufjell vel. Registerlaget viser bare sikre koblinger, på Kartverkets adressepunkt.</p>
    {data.properties && <p className="map-source-note">Eiendomsgrenser: © Kartverket / Geonorge (CC BY 4.0). Hentet {new Date(data.properties.fetchedAt).toLocaleString('nb-NO')}. Hent «Sammenlign register» på nytt for å bruke teigenes matrikkelreferanser.</p>}
    {[...(data.addresses?.warnings || []), ...(data.roads?.warnings || []), ...(data.properties?.warnings || [])].map((warning) => <p key={warning} className="map-warning">{warning}</p>)}
    {data.addresses?.fetchedAt && <p className="muted">Adresser hentet: {new Date(data.addresses.fetchedAt).toLocaleString('nb-NO')}. Kartdata mellomlagres i inntil fem minutter; registerkontroll beregnes på nytt.</p>}
    <ObjectDetails selected={selected} comparison={data.comparison} onClose={() => { setSelected(null); setSelectedMemberId(null); }} onSelect={selectObject} onOpenMember={setSelectedMemberId} />
    {selectedMemberId && <MapMemberDetails key={selectedMemberId} memberId={selectedMemberId} canMatrikkelSync={canMatrikkelSync} onClose={() => setSelectedMemberId(null)} />}
    <ResultsPanel addresses={data.addresses?.addresses} properties={data.addresses ? propertiesFromAddresses(data.addresses.addresses) : null} boundaries={data.properties?.boundaries} roads={data.roads?.roads} comparison={data.comparison} onSelect={selectObject} />
  </div>;
}
