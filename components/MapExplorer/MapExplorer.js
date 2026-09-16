'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import DrawingControls from './DrawingControls';
import { MAX_VERTICES, validatePolygon } from '@/lib/map/geo';
import { addressLabel, sortAddresses } from '@/lib/map/normalization';
import { uniqueRoadNames } from '@/lib/map/export';
import { propertiesFromAddresses } from '@/lib/map/kartverket-property-service';
import { STATUS_LABELS } from '@/lib/map/comparison';
import { requestMap, downloadMapExport } from '@/lib/map/browser-client';
import ResultsPanel from './ResultsPanel';
import ObjectDetails from './ObjectDetails';
import ExportButtons from './ExportButtons';
import HamletControls from './HamletControls';

const MapView = dynamic(() => import('./MapView'), { ssr: false, loading: () => <p role="status">Laster kart …</p> });

export default function MapExplorer() {
  const [vertices, setVertices] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [area, setArea] = useState(null);
  const [error, setError] = useState('');
  const [layers, setLayers] = useState({ addresses: true, roads: true, register: false, boundaries: false, hamlets: true });
  const [hamlets, setHamlets] = useState([]);
  const [hamletBusy, setHamletBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const selectObject = useCallback((item) => setSelected({ ...item }), []);
  const [data, setData] = useState({ addresses: null, roads: null, properties: null, comparison: null });
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(null);
  const requestRef = useRef(null);
  useEffect(() => () => requestRef.current?.abort(), []);
  const invalidate = useCallback(() => {
    requestRef.current?.abort(); requestRef.current = null;
    setData({ addresses: null, roads: null, properties: null, comparison: null }); setSelected(null); setBusy(''); setNotice(''); setRetry(null);
  }, []);
  const changeVertices = useCallback((value) => {
    if (value.length > MAX_VERTICES) { setError(`Maksimalt ${MAX_VERTICES} hjørner.`); return; }
    invalidate();
    setVertices(value); setArea(null); setError('');
  }, [invalidate]);

  async function run(datatype, format) {
    if (!area || editing || drawing) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(format || datatype); setError(''); setNotice(''); setRetry(null);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(35_000)]);
    try {
      if (format) {
        await downloadMapExport({ polygon: area.polygon, format, includeRoads: Boolean(data.roads), includeBoundaries: Boolean(data.properties) }, signal);
        if (requestRef.current === controller) setNotice('Eksporten er generert. Nedlastingen er startet.');
      } else {
        const result = await (await requestMap('search', { polygon: area.polygon, datatype, includeBoundaries: Boolean(data.properties) }, signal)).json();
        if (requestRef.current !== controller) return;
        setSelected(null);
        setData((previous) => datatype === 'properties' ? { ...previous, properties: result, comparison: null }
          : datatype === 'roads' ? { ...previous, roads: result }
          : { ...previous, addresses: result, comparison: datatype === 'comparison' ? result.comparison : null });
        if (datatype === 'properties') setLayers((previous) => ({ ...previous, boundaries: true }));
        setNotice(`${datatype === 'properties' ? result.boundaries.length + ' teiger' : datatype === 'roads' ? result.roads.length + ' veigrupper' : result.addresses.length + ' offisielle adresser'} hentet.${result.mockRegister ? ' Sammenlignet med syntetisk testregister.' : ''}`);
      }
    } catch (failure) {
      if (requestRef.current !== controller || controller.signal.aborted) return;
      setError(signal.aborted ? 'Søket tok for lang tid. Prøv igjen eller tegn et mindre område.' : failure.message);
      setRetry({ datatype, format });
    } finally { if (requestRef.current === controller) { setBusy(''); requestRef.current = null; } }
  }

  async function copy(kind) {
    const values = kind === 'addresses' ? sortAddresses(data.addresses?.addresses || []).map(addressLabel)
      : uniqueRoadNames(data.addresses?.addresses || [], data.roads?.roads || []);
    try {
      if (!values.length) { setNotice('Ingen verdier å kopiere.'); return; }
      await navigator.clipboard.writeText(values.join('\n'));
      setNotice(`${values.length} ${kind === 'addresses' ? 'adresser' : 'veinavn'} kopiert.`);
    } catch { setError('Kunne ikke bruke utklippstavlen. Du kan bruke CSV-eksport i stedet.'); }
  }

  function finish() {
    try {
      setArea(validatePolygon({ type: 'Polygon', coordinates: [[...vertices, vertices[0]]] }));
      setDrawing(false); setEditing(false); setError('');
    } catch (failure) { setError(failure.message); }
  }

  function useHamlet(hamlet) {
    invalidate(); setDrawing(false); setEditing(false); setError('');
    const next = hamlet?.polygon ? validatePolygon(hamlet.polygon) : null;
    setVertices(next ? next.polygon.geometry.coordinates[0].slice(0, -1) : []);
    setArea(next);
    if (next) setSelected({ ...hamlet, id: `hamlet:${hamlet.id}`, kind: 'hamlet', feature: hamlet.polygon });
  }

  return <div className="map-explorer">
    <p>Kontroller Turufjell vels register mot offisielle adresser. Hent bare data for området du tegner. Kartkildene mottar ikke medlemsopplysninger.</p>
    {data.comparison && <div className="map-summary" aria-label="Nøkkeltall">
      <div><strong>{data.comparison.officialCount}</strong><span>Offisielle adresser i polygon</span></div>
      <div><strong>{data.comparison.registerCount}</strong><span>Aktive poster i hele registeret</span></div>
      <div><strong>{data.comparison.unlocatedRows?.length || 0}</strong><span>Ukjent plassering · utenfor mangeltall</span></div>
      {Object.entries(data.comparison.counts).map(([status, count]) => <div key={status}><strong>{count}</strong><span>{STATUS_LABELS[status]}</span></div>)}
    </div>}
    <HamletControls polygon={area?.polygon} drawing={drawing} editing={editing} onUse={useHamlet} onList={setHamlets} onBusy={setHamletBusy} />
    <DrawingControls vertices={vertices} drawing={drawing} editing={editing} onChange={changeVertices} disabled={hamletBusy}
      onStart={() => setDrawing(true)} onFinish={finish} onEdit={() => { invalidate(); setEditing(true); }}
      onDelete={() => { changeVertices([]); setDrawing(false); setEditing(false); setSelected(null); }} />
    {error && <p className="error-message" role="alert">{error}</p>}
    {retry && <button type="button" className="admin-button" disabled={Boolean(busy)} onClick={() => run(retry.datatype, retry.format)}>Prøv igjen</button>}
    <div className="map-actions">
      <button type="button" className="admin-button primary" disabled={!area || drawing || editing || Boolean(busy)} onClick={() => run('addresses')}>Hent adresser</button>
      <button type="button" className="admin-button" disabled={!area || drawing || editing || Boolean(busy)} onClick={() => run('roads')}>Hent veier og stier</button>
      <button type="button" className="admin-button" disabled={!area || drawing || editing || Boolean(busy)} onClick={() => run('properties')}>Hent eiendomsgrenser</button>
      <button type="button" className="admin-button" disabled={!area || drawing || editing || Boolean(busy) || data.addresses?.complete === false} onClick={() => run('comparison')}>Sammenlign register</button>
      {busy && <><span role="status">{busy.includes('csv') || busy === 'geojson' ? 'Lager eksport …' : 'Henter og behandler data …'}</span><button type="button" className="admin-button" onClick={() => { requestRef.current?.abort(); requestRef.current = null; setBusy(''); setNotice('Forespørselen er avbrutt.'); }}>Avbryt</button></>}
    </div>
    {notice && <p role="status">{notice}</p>}
    <p aria-live="polite">{area ? `Areal: ${Math.round(area.areaM2).toLocaleString('nb-NO')} m² (${area.areaKm2.toLocaleString('nb-NO', { maximumFractionDigits: 3 })} km²)` : 'Ingen ferdig søkepolygon.'}</p>
    <fieldset className="map-layer-controls"><legend>Kartlag</legend>{[['addresses', 'Adresser'], ['roads', 'Veier'], ['register', 'Medlemsregister'], ['boundaries', 'Eiendomsgrenser'], ['hamlets', 'Grendegrenser']].map(([key, label]) =>
      <label key={key}><input type="checkbox" checked={layers[key]} onChange={(event) => setLayers({ ...layers, [key]: event.target.checked })} /> {label}</label>)}
    </fieldset>
    <MapView vertices={vertices} drawing={drawing} editing={editing} onVerticesChange={changeVertices} layers={layers} selected={selected} onSelect={selectObject} onError={setError} hamlets={hamlets}
      addresses={data.addresses?.addresses || []} roads={data.roads?.roads || []} boundaries={data.properties?.boundaries || []}
      registerPoints={(data.comparison?.rows || []).filter((r) => r.status === 'MATCH').map((r) => ({
        ...r.officialAddresses[0], name: r.register.hNumber, source: 'Turufjell vel · plassering fra Kartverket',
      }))} />
    <p className="map-source-note">Bakgrunn og offisielle adresser: <a href="https://www.kartverket.no/api-og-data/eiendomsdata/brukarrettleiing-adresse-api" target="_blank" rel="noreferrer">© Kartverket (CC BY 4.0)</a>.
      {' '}Veier/stier: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors (ODbL)</a>. Interne registerfelt: Turufjell vel. Registerlaget viser bare sikre koblinger, på Kartverkets adressepunkt.</p>
    {data.properties && <p className="map-source-note">Eiendomsgrenser: © Kartverket / Geonorge (CC BY 4.0). Hentet {new Date(data.properties.fetchedAt).toLocaleString('nb-NO')}. Hent «Sammenlign register» på nytt for å bruke teigenes matrikkelreferanser.</p>}
    {[...(data.addresses?.warnings || []), ...(data.roads?.warnings || []), ...(data.properties?.warnings || [])].map((warning) => <p key={warning} className="map-warning">{warning}</p>)}
    {data.addresses?.fetchedAt && <p className="muted">Adresser hentet: {new Date(data.addresses.fetchedAt).toLocaleString('nb-NO')}. Kartdata mellomlagres i inntil fem minutter; registerkontroll beregnes på nytt.</p>}
    <ObjectDetails selected={selected} comparison={data.comparison} onClose={() => setSelected(null)} onSelect={selectObject} />
    <ExportButtons ready={Boolean(data.addresses?.complete)} hasRoads={Boolean(data.roads)} hasComparison={Boolean(data.comparison)} busy={Boolean(busy) || drawing || editing}
      onExport={(format) => run(null, format)} onCopy={copy} />
    <ResultsPanel addresses={data.addresses?.addresses} properties={data.addresses ? propertiesFromAddresses(data.addresses.addresses) : null} boundaries={data.properties?.boundaries} roads={data.roads?.roads} comparison={data.comparison} onSelect={selectObject} />
  </div>;
}
