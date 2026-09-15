'use client';

import { useEffect, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';

const statusLabels = { pending: 'Venter', running: 'Pågår', completed: 'Fullført', failed: 'Feilet', cancelled: 'Stoppet' };

export default function MatrikkelSyncPanel({ initialRuns, configured, databaseReady }) {
  const [runs, setRuns] = useState(initialRuns);
  const [activeId, setActiveId] = useState(initialRuns.find((run) => ['pending', 'running'].includes(run.status))?.id || null);
  const [active, setActive] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [scope, setScope] = useState('all');
  const [starting, setStarting] = useState(false);
  const [processingLocally, setProcessingLocally] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!activeId) return undefined;
    let stopped = false;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/admin/matrikkel/runs?id=${activeId}`, { cache: 'no-store' });
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.message);
        if (stopped) return;
        setActive(body.data);
        setRuns((current) => [body.data, ...current.filter((run) => run.id !== body.data.id)].slice(0, 10));
        if (['completed', 'failed', 'cancelled'].includes(body.data.status)) setActiveId(null);
      } catch (error) { if (!stopped) setMessage(error.message || 'Kunne ikke hente status.'); }
    };
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [activeId]);

  async function processNext(runId) {
    setProcessingLocally(true);
    try {
      let status = 'running';
      while (['pending', 'running'].includes(status)) {
        const response = await fetch(`/api/admin/matrikkel/runs/${runId}/process`, { method: 'POST' });
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.message);
        status = body.run.status;
        setActive(body.run);
      }
    } catch (error) { setMessage(error.message || 'Synkroniseringen stoppet.'); }
    finally { setProcessingLocally(false); }
  }

  async function start() {
    setStarting(true); setMessage('');
    try {
      const response = await fetch('/api/admin/matrikkel/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hNumber: scope === 'test' ? '25' : null }) });
      const body = await response.json();
      const isFinished = ['completed', 'failed', 'cancelled'].includes(body.run?.status);
      if (body.run) {
        setConfirm(false); setActiveId(isFinished ? null : body.run.id); setActive(body.run);
        setRuns((current) => [body.run, ...current.filter((run) => run.id !== body.run.id)].slice(0, 10));
      }
      if (!response.ok || !body.ok) throw new Error(body.message);
      if (!body.backgroundStarted && !isFinished) processNext(body.run.id);
    } catch (error) { setConfirm(false); setMessage(error.message || 'Kunne ikke starte synkroniseringen.'); }
    finally { setStarting(false); }
  }

  async function approve(item) {
    setMessage('');
    try {
      const response = await fetch(`/api/admin/matrikkel/runs/${active.id}/items/${item.member_id}/approve`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message);
      const detailResponse = await fetch(`/api/admin/matrikkel/runs?id=${active.id}`, { cache: 'no-store' });
      const detail = await detailResponse.json();
      if (!detailResponse.ok || !detail.ok) throw new Error(detail.message);
      setActive(detail.data);
      setRuns((current) => [detail.data, ...current.filter((run) => run.id !== detail.data.id)].slice(0, 10));
    } catch (error) { setMessage(error.message || 'Kunne ikke godkjenne oppslaget.'); }
  }

  async function stop() {
    if (!activeId) return;
    setStarting(true); setMessage('');
    try {
      const response = await fetch(`/api/admin/matrikkel/runs/${activeId}?action=cancel`, { method: 'DELETE' });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message);
      setActive(body.run);
      setRuns((current) => [body.run, ...current.filter((run) => run.id !== body.run.id)].slice(0, 10));
      setActiveId(null); setConfirmStop(false);
    } catch (error) { setConfirmStop(false); setMessage(error.message || 'Kunne ikke stoppe synkroniseringen.'); }
    finally { setStarting(false); }
  }

  async function removeRun() {
    if (!deleteCandidate) return;
    setStarting(true); setMessage('');
    try {
      const response = await fetch(`/api/admin/matrikkel/runs/${deleteCandidate.id}`, { method: 'DELETE' });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message);
      setRuns((current) => current.filter((run) => run.id !== deleteCandidate.id));
      if (active?.id === deleteCandidate.id) setActive(null);
      setDeleteCandidate(null);
    } catch (error) { setDeleteCandidate(null); setMessage(error.message || 'Kunne ikke fjerne kjøringen.'); }
    finally { setStarting(false); }
  }

  const current = active || runs[0];
  return <>
    <section className="matrikkel-intro"><div><p>Oppslaget bruker medlemmenes gateadresse og oppdaterer bare gårds- og bruksnummer, hjemmelshavere og Matrikkelens <code>datoFra</code>. Eksisterende verdier beholdes ved feil eller usikre treff.</p><p>Før jobben starter lagres et øyeblikksbilde av alle feltene jobben kan endre.</p></div><div className="matrikkel-actions"><button className="admin-button" type="button" onClick={() => { setScope('test'); setConfirm(true); }} disabled={!configured || !databaseReady || starting || processingLocally || Boolean(activeId)}>Test H-nummer 25</button><button className="primary-button" type="button" onClick={() => { setScope('all'); setConfirm(true); }} disabled={!configured || !databaseReady || starting || processingLocally || Boolean(activeId)}>{activeId || processingLocally ? 'Synkronisering pågår …' : 'Synkroniser alle'}</button>{activeId && <button className="admin-button" type="button" onClick={() => setConfirmStop(true)} disabled={starting}>Stopp kjøring</button>}</div></section>
    {!configured && <p className="form-error" role="alert">Matrikkel-API er ikke konfigurert. Legg API_MATRIKKEL_BASE_URL, API_MATRIKKEL_USR og API_MATRIKKEL_PWD i serverens miljøvariabler.</p>}
    {!databaseReady && <p className="form-error" role="alert">Databaseskjemaet mangler synkroniseringstabellene. Kjør npm run db:setup.</p>}
    {message && <p className="form-error" role="alert">{message}</p>}
    {current && <section className="matrikkel-status" aria-live="polite"><div><p className="eyebrow">Siste kjøring{current.h_number_filter ? ` · H-nummer ${current.h_number_filter}` : ' · Alle medlemmer'}</p><h2>{statusLabels[current.status] || current.status}</h2><p>Startet av {current.requested_by}</p></div><dl><div><dt>Behandlet</dt><dd>{current.processed_count || 0} / {current.total_count || 0}</dd></div><div><dt>Oppdatert</dt><dd>{current.updated_count || 0}</dd></div><div><dt>Uendret</dt><dd>{current.unchanged_count || 0}</dd></div><div><dt>Til kontroll</dt><dd>{current.review_count || 0}</dd></div><div><dt>Feil/hoppet over</dt><dd>{current.error_count || 0}</dd></div><div><dt>Sikkerhetskopiert</dt><dd>{current.backup_count ?? current.total_count ?? 0}</dd></div></dl>{current.error_message && <p className="form-error">{current.error_message}</p>}</section>}
    {active?.items?.length > 0 && <div className="admin-table-scroll" role="region" aria-label="Avvik fra matrikkelsynkronisering" tabIndex={0}><table className="admin-table"><caption>Oppslag som ikke endret medlemsregisteret automatisk.</caption><thead><tr><th>H-nummer</th><th>Status</th><th>Adresse</th><th>Forslag</th><th>Melding</th><th>Handling</th></tr></thead><tbody>{active.items.map((item) => <tr key={item.member_id}><th scope="row">{item.h_number}</th><td>{item.status}</td><td>{item.source_address || 'Mangler'}</td><td>{item.proposed_values ? `${item.proposed_values.cadastral_number || ''} · ${item.proposed_values.title_holder || 'Ingen eier'}` : 'Ingen'}</td><td>{item.message}</td><td>{item.status === 'review' && item.proposed_values && <button className="admin-button" type="button" onClick={() => approve(item)}>Godkjenn</button>}</td></tr>)}</tbody></table></div>}
    {runs.length > 0 && <section className="matrikkel-history"><h2>Tidligere kjøringer</h2><ul>{runs.map((run) => <li key={run.id}><button className="matrikkel-history-open" type="button" onClick={() => { setActiveId(run.id); setActive(run); }}>{new Date(run.created_at).toLocaleString('nb-NO')} · {statusLabels[run.status] || run.status} · {run.processed_count || 0}/{run.total_count}</button>{!['pending', 'running'].includes(run.status) && <button className="matrikkel-history-delete" type="button" onClick={() => setDeleteCandidate(run)} aria-label={`Fjern kjøringen fra ${new Date(run.created_at).toLocaleString('nb-NO')} fra loggen`}>Slett</button>}</li>)}</ul></section>}
    <ConfirmDialog open={confirm} title={scope === 'test' ? 'Teste med H-nummer 25?' : 'Synkronisere alle medlemmer?'} description="Det tas først en sikkerhetskopi av feltene som kan endres. Sikre treff oppdateres automatisk; usikre treff legges til kontroll." confirmLabel={scope === 'test' ? 'Start test' : 'Synkroniser alle'} busy={starting} onCancel={() => setConfirm(false)} onConfirm={start} />
    <ConfirmDialog open={confirmStop} title="Stoppe matrikkelkjøringen?" description="Ingen flere medlemmer blir behandlet. Endringer som allerede er fullført beholdes, og sikkerhetskopien og historikken slettes ikke." confirmLabel="Stopp kjøring" busy={starting} onCancel={() => setConfirmStop(false)} onConfirm={stop} />
    <ConfirmDialog open={Boolean(deleteCandidate)} title="Fjerne kjøringen fra loggen?" description="Kjøringen skjules fra oversikten. Backup og revisjonsdata beholdes i databasen." confirmLabel="Slett fra loggen" busy={starting} onCancel={() => setDeleteCandidate(null)} onConfirm={removeRun} />
  </>;
}
