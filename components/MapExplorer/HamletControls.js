'use client';

import { useEffect, useRef, useState } from 'react';
import { loadMapHamlets, persistMapHamlet } from '@/lib/map/browser-client';
import { HAMLET_DRAFT_OPTIONS, prepareHamletDraft } from '@/lib/map/hamlet-drafts';

const geometryKey = (polygon) => polygon ? JSON.stringify(polygon.geometry) : '';

export default function HamletControls({ polygon, editing, drawing, onUse, onList, onBusy }) {
  const [hamlets, setHamlets] = useState([]);
  const [chosen, setChosen] = useState('');
  const [chosenDraft, setChosenDraft] = useState('');
  const [current, setCurrent] = useState(null);
  const [name, setName] = useState('');
  const [reviewedFor, setReviewedFor] = useState('');
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const saveRequest = useRef(null);
  const key = geometryKey(polygon);
  const reviewed = Boolean(key && key === reviewedFor);
  const dirty = Boolean(key !== geometryKey(current?.polygon) || name !== (current?.name || '')
    || reviewed !== Boolean(current?.reviewed) || drawing || editing);

  useEffect(() => {
    const controller = new AbortController();
    loadMapHamlets(AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]))
      .then((rows) => {
        if (controller.signal.aborted) return;
        setHamlets(rows); onList(rows); setLoaded(true);
      })
      .catch(() => { if (!controller.signal.aborted) setError('Kunne ikke hente grendene. Prøv igjen. Kontroller at grendemigreringen er kjørt.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload, onList]);
  useEffect(() => () => saveRequest.current?.abort(), []);

  function load(hamlet) {
    if (dirty && !window.confirm('Du har et ulagret område eller grendeendringer. Vil du bytte grend?')) return;
    setCurrent(hamlet); setChosen(hamlet?.id || ''); setName(hamlet?.name || '');
    setReviewedFor(hamlet?.reviewed ? geometryKey(hamlet.polygon) : '');
    setError(''); setNotice(hamlet && !hamlet.polygon ? 'Grenden har ikke polygon ennå. Tegn området og lagre det.' : '');
    onUse(hamlet);
  }

  function loadDraft() {
    try {
      const { current: target, draft } = prepareHamletDraft(chosenDraft, hamlets);
      if (dirty && !window.confirm('Du har ulagrede endringer. Vil du erstatte søkeområdet med kartutkastet?')) return;
      setCurrent(target); setChosen(target?.id || ''); setName(draft.name); setReviewedFor('');
      setError('');
      setNotice(`«${draft.name}» er lastet som omtrentlig utkast, ikke lagret. Velg «Rediger polygon» for å flytte hjørnene, og lagre når du er klar.`);
      onUse(draft);
    } catch (failure) { setError(failure.message); }
  }

  async function save(action) {
    if (saving || !loaded || (action !== 'clear' && (!polygon || drawing || editing))) return;
    if (action === 'clear' && !window.confirm(`Fjern det lagrede polygonet for «${current.name}»? Grenden og tilknyttede medlemmer beholdes.`)) return;
    const controller = new AbortController(); saveRequest.current = controller;
    setSaving(true); onBusy(true); setError(''); setNotice('');
    try {
      const result = await persistMapHamlet({ action, id: current?.id, version: current?.version,
        name, polygon, reviewed }, AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]));
      if (controller.signal.aborted) return;
      const rows = [...hamlets.filter((h) => h.id !== result.id), result].sort((a, b) => a.name.localeCompare(b.name, 'nb'));
      setHamlets(rows); onList(rows); setCurrent(result); setChosen(result.id); setName(result.name);
      setReviewedFor(result.reviewed ? geometryKey(result.polygon) : '');
      onUse(result);
      setNotice(action === 'clear' ? 'Polygonet er fjernet. Grenden og medlemskoblingene er beholdt.' : `«${result.name}» er lagret i databasen.`);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.name === 'TimeoutError' || failure.name === 'AbortError'
        ? 'Lagring kunne ikke bekreftes. Last grendelisten på nytt og kontroller før du prøver igjen. Utkastet er beholdt.' : failure.message);
    } finally { if (!controller.signal.aborted) { setSaving(false); onBusy(false); } }
  }

  return <section className="map-hamlet-controls" aria-labelledby="map-hamlets-heading">
    <h2 id="map-hamlets-heading">Grender og lagrede polygoner</h2>
    <p>Bruk navnene fra kartet for områdene med røde grenser. Områder uten avgrensning opprettes ikke automatisk.
      Grendegrenser er interne søkeområder, ikke offisielle eiendomsgrenser. Lagring flytter ingen medlemmer.</p>
    <fieldset disabled={saving}>
      <legend>Velg eller opprett grend</legend>
      <div className="map-actions">
        <label>Kartutkast fra bildet<select value={chosenDraft} onChange={(event) => setChosenDraft(event.target.value)}>
          <option value="">Velg et omtrentlig utkast …</option>
          {HAMLET_DRAFT_OPTIONS.map((draft) => <option key={draft.id} value={draft.id}>{draft.name}</option>)}
        </select></label>
        <button type="button" className="admin-button" disabled={!chosenDraft || loading} onClick={loadDraft}>Bruk kartutkast</button>
      </div>
      <p className="muted">{HAMLET_DRAFT_OPTIONS.length} navngitte områder med røde grenser. Utkastene er grovt plassert og må kontrolleres.
        Ingenting lagres automatisk. Et eksisterende lagret polygon blir aldri erstattet av et kartutkast.</p>
      <div className="map-actions">
        <label>Lagret grend<select value={chosen} onChange={(event) => setChosen(event.target.value)} disabled={loading}>
          <option value="">Velg grend …</option>
          {hamlets.map((h) => <option key={h.id} value={h.id}>{h.name}{!h.polygon ? ' · uten polygon' : h.reviewed ? '' : ' · må kontrolleres'}</option>)}
        </select></label>
        <button type="button" className="admin-button" disabled={!chosen || loading} onClick={() => load(hamlets.find((h) => h.id === chosen))}>Bruk grend i kartet</button>
        <button type="button" className="admin-button" onClick={() => load(null)}>Ny grend</button>
        <button type="button" className="admin-button" disabled={loading} onClick={() => { setError(''); setLoading(true); setReload((n) => n + 1); }}>Last grendelisten på nytt</button>
      </div>
      <label>Navn på grend<input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="Navn fra kartet" /></label>
      <label className="map-hamlet-review"><input type="checkbox" checked={reviewed} disabled={!polygon || editing || drawing}
        onChange={(event) => setReviewedFor(event.target.checked ? key : '')} /> Jeg har kontrollert plasseringen av dette polygonet i kartet</label>
      <p className="map-warning">{reviewed ? 'Manuelt kontrollert intern grendegrense – ikke en matrikkelgrense.' : 'Utkast – plasseringen må kontrolleres. Et lite kartbilde er ikke grunnlag for presise koordinater.'}</p>
      <div className="map-actions">
        <button type="button" className="admin-button primary" disabled={!loaded || loading || !polygon || editing || drawing || !name.trim()}
          onClick={() => save(current ? 'save' : 'create')}>{saving ? 'Lagrer grend …' : current ? 'Lagre grendeendringer' : 'Lagre polygon som ny grend'}</button>
        <button type="button" className="admin-button" disabled={!current?.polygon || !loaded || loading} onClick={() => save('clear')}>Fjern lagret polygon</button>
      </div>
    </fieldset>
    {current && <p className="muted">Redigerer «{current.name}» · versjon {current.version}. {dirty ? 'Ulagrede endringer.' : 'Lagret versjon.'}</p>}
    {loading && <p role="status">Laster grender …</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
