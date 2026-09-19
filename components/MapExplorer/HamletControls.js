'use client';

import Select from "@/components/Select";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { loadMapHamlets, persistMapHamlet } from '@/lib/map/browser-client';
import { useI18n } from '@/components/LocaleProvider';

const geometryKey = (polygon) => polygon ? JSON.stringify(polygon.geometry) : '';

const HamletControls = forwardRef(function HamletControls({ polygon, editing, drawing, onUse, onList, onBusy, onDirty, mode = 'maintain' }, ref) {
  const { t, locale } = useI18n('map.admin.hamlets');
  const [hamlets, setHamlets] = useState([]);
  const [chosen, setChosen] = useState('');
  const [current, setCurrent] = useState(null);
  const [creating, setCreating] = useState(false);
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
  const dirty = Boolean((creating || current) && (key !== geometryKey(current?.polygon) || name !== (current?.name || '')
    || reviewed !== Boolean(current?.reviewed) || drawing || editing));

  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);

  useEffect(() => {
    const controller = new AbortController();
    loadMapHamlets(AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]), t('loadError'))
      .then((rows) => {
        if (controller.signal.aborted) return;
        setHamlets(rows); onList(rows); setLoaded(true);
      })
      .catch(() => { if (!controller.signal.aborted) setError(t('loadError')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload, onList, t]);
  useEffect(() => () => saveRequest.current?.abort(), []);

  const load = useCallback((hamlet) => {
    if (dirty && !window.confirm(t('confirmSwitch'))) return;
    setCurrent(hamlet); setCreating(!hamlet); setChosen(hamlet?.id || ''); setName(hamlet?.name || '');
    setReviewedFor(hamlet?.reviewed ? geometryKey(hamlet.polygon) : '');
    setError(''); setNotice(hamlet && !hamlet.polygon ? t('needsPolygon') : '');
    onUse(hamlet);
  }, [dirty, onUse, t]);

  useImperativeHandle(ref, () => ({
    loadById(id) {
      const hamlet = hamlets.find((item) => item.id === id);
      if (loaded && hamlet) load(hamlet);
    },
  }), [hamlets, load, loaded]);

  async function save(action) {
    if (saving || !loaded || (action !== 'clear' && (!polygon || drawing || editing))) return;
    if (action === 'clear' && !window.confirm(t('confirmClear', {name: current.name}))) return;
    const controller = new AbortController(); saveRequest.current = controller;
    setSaving(true); onBusy(true); setError(''); setNotice('');
    try {
      const saved = await persistMapHamlet({ action, id: current?.id, version: current?.version,
        name, polygon, reviewed }, AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]), t('saveError'));
      if (controller.signal.aborted) return;
      const result = saved.hamlet;
      const rows = [...hamlets.filter((h) => h.id !== result.id), result].sort((a, b) => a.name.localeCompare(b.name, locale));
      setHamlets(rows); onList(rows); setCurrent(result); setChosen(result.id); setName(result.name);
      setCreating(false);
      setReviewedFor(result.reviewed ? geometryKey(result.polygon) : '');
      onUse(result);
      const storedNotice = action === 'clear' ? t('cleared') : t('savedNotice', {name: result.name});
      setNotice(saved.rematch?.status === 'failed'
        ? `${storedNotice}${t('rematchFailed')}`
        : ['queued', 'started'].includes(saved.rematch?.status)
          ? `${storedNotice}${t('rematch')}` : storedNotice);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.name === 'TimeoutError' || failure.name === 'AbortError'
        ? t('saveTimeout') : failure.message);
    } finally { if (!controller.signal.aborted) { setSaving(false); onBusy(false); } }
  }

  return <section className={`map-hamlet-controls is-${mode}`} aria-labelledby="map-hamlets-heading">
    <h2 id="map-hamlets-heading">{t(mode === 'select' ? 'selectTitle' : 'title')}</h2>
    <p>{t(mode === 'select' ? 'selectHelp' : 'help')}</p>
    <div className="map-hamlet-editor">
        <fieldset disabled={saving}>
          <legend>{t(mode === 'select' ? 'selectLegend' : 'legend')}</legend>
          <div className="select-action-row">
            <label>{t('saved')}<Select value={chosen} onChange={(event) => {
              const hamlet = hamlets.find((item) => item.id === event.target.value);
              if (hamlet) load(hamlet);
            }} disabled={loading}>
              <option value="">{t('choose')}</option>
              {hamlets.map((h) => <option key={h.id} value={h.id}>{h.name}{!h.polygon ? ` · ${t('noPolygon')}` : h.reviewed ? '' : ` · ${t('reviewNeeded')}`}</option>)}
            </Select></label>
            {mode === 'maintain' && <button type="button" className="admin-button" onClick={() => load(null)}>{t('new')}</button>}
          </div>
          <button type="button" className="admin-button map-hamlet-reload" disabled={loading} onClick={() => { setError(''); setLoading(true); setReload((n) => n + 1); }}>{t('reload')}</button>
          {mode === 'maintain' && (creating || current) && <><label>{t('name')}<input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder={t('name')} /></label>
            <label className="map-hamlet-review"><input type="checkbox" checked={reviewed} disabled={!polygon || editing || drawing}
              onChange={(event) => setReviewedFor(event.target.checked ? key : '')} /> {t('checked')}</label>
            <p className="map-warning">{t(reviewed ? 'reviewed' : 'draft')}</p>
            <div className="map-actions">
              <button type="button" className="admin-button primary" disabled={!loaded || loading || !polygon || editing || drawing || !name.trim()}
                onClick={() => save(current ? 'save' : 'create')}>{t(saving ? 'saving' : current ? 'save' : 'create')}</button>
              <button type="button" className="admin-button" disabled={!current?.polygon || !loaded || loading} onClick={() => save('clear')}>{t('clear')}</button>
            </div></>}
        </fieldset>
        {mode === 'select' && current?.polygon && <div className="map-area-card"><strong>{current.name}</strong><span>{t(current.reviewed ? 'selectedReviewed' : 'selectedDraft')}</span></div>}
        {mode === 'maintain' && current && <p className="muted">{t('editing', {name: current.name, version: current.version, state: t(dirty ? 'dirty' : 'stored')})}</p>}
        {loading && <p role="status">{t('loading')}</p>}
        {error && <p className="error-message" role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
    </div>
  </section>;
});

export default HamletControls;
