'use client';

import { useMemo, useState } from 'react';
import { useApiClient } from '@/components/useApiClient';
import { useI18n } from '@/components/LocaleProvider';
import { ACTIVITY_MAP_SOURCE_IDS, ACTIVITY_MAP_SOURCES } from '@/lib/activity-map-sources';

const selectableStatuses = new Set(['new', 'matched', 'changed']);
const effectiveStatus = (candidate) => candidate.decision === 'rejected' ? 'rejected' : candidate.status;

export default function ActivityMapImportPanel({ disabled, onApplied, onPreviewChange }) {
  const apiFetch = useApiClient();
  const { t } = useI18n('activityMap.admin.import');
  const [sourceIds, setSourceIds] = useState(ACTIVITY_MAP_SOURCE_IDS);
  const [run, setRun] = useState(null);
  const [selected, setSelected] = useState([]);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const candidates = useMemo(() => run?.candidates || [], [run]);
  const filtered = useMemo(() => candidates.filter((candidate) => (sourceFilter === 'all' || candidate.sourceId === sourceFilter)
    && (statusFilter === 'all' || effectiveStatus(candidate) === statusFilter)), [candidates, sourceFilter, statusFilter]);

  function showCandidates(currentRun, nextSourceFilter = sourceFilter, nextStatusFilter = statusFilter) {
    onPreviewChange((currentRun?.candidates || []).filter((candidate) => candidate.geometry
      && (nextSourceFilter === 'all' || candidate.sourceId === nextSourceFilter)
      && (nextStatusFilter === 'all' || effectiveStatus(candidate) === nextStatusFilter))
      .map((candidate) => ({ ...candidate, sourceName: ACTIVITY_MAP_SOURCES[candidate.sourceId]?.name || candidate.sourceId })));
  }

  async function request(body) {
    const response = await apiFetch('/api/admin/activity-map/import', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.message || t('requestError'));
    return data;
  }

  async function preview() {
    setBusy(true); setError(''); setNotice('');
    try {
      const { run: next } = await request({ action: 'preview', sourceIds });
      setRun(next);
      setSelected([]);
      showCandidates(next);
      setNotice(t('previewReady', { count: next.summary.total }));
    } catch (failure) { setError(failure.message); onPreviewChange([]); }
    finally { setBusy(false); }
  }

  async function apply() {
    if (!run || !selected.length) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const { result } = await request({ action: 'apply', runId: run.id, planSha256: run.planSha256, itemIds: selected });
      setNotice(t('applied', result)); setSelected([]); onPreviewChange([]);
      await onApplied();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  async function reject(candidate) {
    setBusy(true); setError(''); setNotice('');
    try {
      await request({ action: 'reject', runId: run.id, itemIds: [candidate.id] });
      setSelected((current) => current.filter((id) => id !== candidate.id));
      const next = { ...run,
        summary: { ...run.summary, [candidate.status]: Math.max(0, (run.summary[candidate.status] || 0) - 1),
          rejected: (run.summary.rejected || 0) + 1 },
        candidates: run.candidates.map((item) => item.id === candidate.id ? { ...item, decision: 'rejected' } : item),
      };
      setRun(next); showCandidates(next);
      setNotice(t('rejected', { name: candidate.name }));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  function toggleSource(sourceId, checked) {
    setSourceIds((current) => checked ? [...current, sourceId] : current.filter((id) => id !== sourceId));
  }

  function toggleItem(itemId, checked) {
    setSelected((current) => checked ? [...current, itemId] : current.filter((id) => id !== itemId));
  }

  const statuses = ['new', 'matched', 'changed', 'unchanged', 'rejected', 'missing'];
  return <details className="activity-import-panel">
    <summary>{t('title')}</summary>
    <div className="activity-import-content">
      <p>{t('help')}</p>
      <fieldset className="activity-import-sources"><legend>{t('sources')}</legend>
        {ACTIVITY_MAP_SOURCE_IDS.map((sourceId) => <label key={sourceId}><input type="checkbox" checked={sourceIds.includes(sourceId)}
          disabled={busy || disabled} onChange={(event) => toggleSource(sourceId, event.target.checked)} /> {ACTIVITY_MAP_SOURCES[sourceId].name}</label>)}
      </fieldset>
      <p className="muted">{t('area')}</p>
      <button type="button" className="admin-button" disabled={busy || disabled || !sourceIds.length} onClick={preview}>
        {busy ? t('working') : t('preview')}
      </button>
      {run && <>
        <dl className="activity-import-summary">
          <div><dt>{t('fetchedAt')}</dt><dd>{new Date(run.fetchedAt).toLocaleString()}</dd></div>
          <div><dt>{t('fingerprint')}</dt><dd><code>{run.rawSha256.slice(0, 12)}</code></dd></div>
          {statuses.map((status) => <div key={status}><dt>{t(`statuses.${status}`)}</dt><dd>{run.summary[status] || 0}</dd></div>)}
        </dl>
        <div className="activity-import-filters">
          <label>{t('sourceFilter')}<select value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value); showCandidates(run, event.target.value, statusFilter); }}>
            <option value="all">{t('allSources')}</option>{ACTIVITY_MAP_SOURCE_IDS.map((id) => <option key={id} value={id}>{ACTIVITY_MAP_SOURCES[id].name}</option>)}
          </select></label>
          <label>{t('statusFilter')}<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); showCandidates(run, sourceFilter, event.target.value); }}>
            <option value="all">{t('allStatuses')}</option>{statuses.map((status) => <option key={status} value={status}>{t(`statuses.${status}`)}</option>)}
          </select></label>
        </div>
        <div className="activity-import-table-wrap"><table className="activity-import-table"><caption>{t('candidateCaption')}</caption>
          <thead><tr><th scope="col">{t('select')}</th><th scope="col">{t('candidate')}</th><th scope="col">{t('source')}</th><th scope="col">{t('status')}</th><th scope="col">{t('match')}</th></tr></thead>
          <tbody>{filtered.map((candidate) => {
            const canSelect = selectableStatuses.has(candidate.status) && !candidate.matchedItemId && candidate.decision !== 'rejected';
            return <tr key={candidate.id}><td><input type="checkbox" aria-label={t('selectCandidate', { name: candidate.name })}
              disabled={!canSelect || busy} checked={selected.includes(candidate.id)} onChange={(event) => toggleItem(candidate.id, event.target.checked)} /></td>
              <th scope="row">{candidate.name}</th><td>{ACTIVITY_MAP_SOURCES[candidate.sourceId]?.name}</td><td>{t(`statuses.${effectiveStatus(candidate)}`)}</td>
              <td>{candidate.decision === 'rejected' ? t('statuses.rejected') : candidate.matchedFeatureName || (candidate.matchedItemId ? t('pairedSource') : candidate.matchScore ? t('score', { score: Math.round(candidate.matchScore * 100) }) : '—')}
                {canSelect && <button type="button" className="table-link-button" disabled={busy} onClick={() => reject(candidate)}>{t('reject')}</button>}</td></tr>;
          })}</tbody>
        </table></div>
        <div className="activity-import-selection-actions"><button type="button" className="admin-button" disabled={busy}
          onClick={() => setSelected((current) => [...new Set([...current, ...filtered.filter((candidate) => selectableStatuses.has(candidate.status) && !candidate.matchedItemId && candidate.decision !== 'rejected').map((candidate) => candidate.id)])])}>{t('selectVisible')}</button>
          <button type="button" className="admin-button" disabled={busy || !selected.length} onClick={() => setSelected([])}>{t('clearSelection')}</button></div>
        <p className="muted">{t('keepHelp')}</p>
        <button type="button" className="primary-button" disabled={busy || disabled || !selected.length || run.status !== 'preview'} onClick={apply}>
          {t('apply', { count: selected.length })}
        </button>
      </>}
      {error && <p className="error-message" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    </div>
  </details>;
}
