'use client';

import { useCallback, useEffect, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';

const statusLabels = {
  pending: 'Venter', processing: 'Behandles', running: 'Sender', sent: 'Sendt',
  delivered: 'Levert', failed: 'Feilet', bounced: 'Avvist', suppressed: 'Undertrykt',
  completed: 'Fullført', cancelled: 'Avbrutt',
};

export default function SurveyEmailPanel({ surveyId, adminEmail }) {
  const [overview, setOverview] = useState(null);
  const [state, setState] = useState('loading');
  const [page, setPage] = useState(1);
  const [recipients, setRecipients] = useState(adminEmail || '');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [confirmSend, setConfirmSend] = useState(false);

  const load = useCallback(async (signal) => {
    try {
      const response = await fetch(`/api/admin/surveys/${surveyId}/email?page=${page}`, { signal });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || 'Kunne ikke hente e-poststatus.');
      setOverview(body.overview);
      setState('ready');
    } catch (error) {
      if (error.name !== 'AbortError') { setMessage(error.message); setState('error'); }
    }
  }, [page, surveyId]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => load(controller.signal), 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [load]);

  useEffect(() => {
    if (!['pending', 'running'].includes(overview?.campaign?.status)) return undefined;
    const timer = setInterval(() => load(), 5000);
    return () => clearInterval(timer);
  }, [load, overview?.campaign?.status]);

  async function post(action, extra = {}) {
    setBusy(action);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/surveys/${surveyId}/email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }),
      });
      const body = await response.json();
      if (body.campaign) setOverview((current) => current ? { ...current, campaign: body.campaign } : current);
      if (!response.ok || !body.ok) throw new Error(body.message || 'E-posthandlingen feilet.');
      setMessage(action === 'test' ? `${body.delivery.recipientCount} ${body.delivery.recipientCount === 1 ? 'testmail er' : 'testmailer er'} akseptert av MailerSend.` : body.backgroundStarted ? 'Utsendelsen er startet.' : 'Utsendelsen er opprettet, men bakgrunnsjobben startet ikke. Kontroller Netlify-oppsettet.');
      await load();
    } catch (error) { setMessage(error.message); }
    finally { setBusy(''); setConfirmSend(false); }
  }

  if (state === 'loading') return <p role="status">Henter e-poststatus …</p>;
  if (!overview) return <p className="form-error" role="alert">{message || 'Kunne ikke hente e-poststatus.'}</p>;
  const campaign = overview.campaign;
  const progress = campaign?.total_count ? Math.round(((campaign.sent_count + campaign.failed_count + campaign.suppressed_count) / campaign.total_count) * 100) : 0;
  const canStart = overview.configured && overview.bulk_enabled && overview.survey?.can_send && !campaign && overview.recipient_count > 0;
  const canResume = overview.configured && overview.bulk_enabled && overview.survey?.can_send && ['pending', 'failed'].includes(campaign?.status);
  const canReplace = overview.configured && overview.bulk_enabled && overview.survey?.can_send && campaign?.status === 'completed' && overview.recipient_count > 0;

  return <section className="survey-email" aria-labelledby="survey-email-heading">
    <div className="survey-results-summary"><div><p className="eyebrow">E-post</p><h3 id="survey-email-heading">Send undersøkelsen</h3><p>Personlige lenker opprettes server-side og vises aldri her.</p></div></div>
    {!overview.configured && <p className="survey-email-warning" role="alert">MailerSend er deaktivert eller mangler konfigurasjon.</p>}
    <div className="survey-email-counts" aria-label="Mottakeroversikt">
      <div><strong>{overview.recipient_count}</strong><span>aktuelle mottakere</span></div>
      <div><strong>{overview.missing_email_count}</strong><span>mangler gyldig e-post</span></div>
    </div>

    <section className="survey-email-card">
      <h4>Send testmail</h4>
      <p>Bruker samme mal og leverandør, men aldri en personlig medlemslenke. Oppgi én eller to adresser, adskilt med komma.</p>
      <label>Testmottakere<input type="email" multiple value={recipients} onChange={(event) => setRecipients(event.target.value)} placeholder="navn@eksempel.no, navn2@eksempel.no" required /></label>
      <button className="admin-button" type="button" disabled={!overview.configured || busy} onClick={() => post('test', { recipient: recipients })}>{busy === 'test' ? 'Sender …' : 'Send testmail'}</button>
    </section>

    <section className="survey-email-card">
      <h4>Masseutsendelse</h4>
      {!overview.bulk_enabled && <p className="survey-email-warning" role="status">Masseutsendelse er deaktivert inntil den blir aktivert eksplisitt.</p>}
      {campaign ? <>
        <div className="survey-email-campaign-heading"><span className={`status-pill is-${campaign.status === 'completed' ? 'open' : 'closed'}`}>{statusLabels[campaign.status] || campaign.status}</span><span>{progress} % behandlet</span></div>
        <div className="progress-track" aria-label={`${progress} prosent behandlet`}><span className="progress-value" style={{ width: `${progress}%` }} /></div>
        <dl className="survey-email-stats"><div><dt>Akseptert</dt><dd>{campaign.sent_count}</dd></div><div><dt>Levert</dt><dd>{campaign.delivered_count}</dd></div><div><dt>Feilet</dt><dd>{campaign.failed_count}</dd></div><div><dt>Undertrykt</dt><dd>{campaign.suppressed_count}</dd></div></dl>
        {campaign.error_message && <p className="form-error" role="alert">Jobben stoppet: {campaign.error_message}</p>}
        {canResume && <button className="admin-button" type="button" disabled={busy} onClick={() => setConfirmSend(true)}>Start bakgrunnsjobben på nytt</button>}
        {canReplace && <button className="admin-button" type="button" disabled={busy} onClick={() => setConfirmSend(true)}>Send nye sikre lenker</button>}
      </> : <>
        <p>{overview.recipient_count} {overview.recipient_count === 1 ? 'medlem vil' : 'medlemmer vil'} motta denne undersøkelsen. En utsendelse kan ikke startes på nytt automatisk.</p>
        <button className="primary-button" type="button" disabled={!canStart || busy} onClick={() => setConfirmSend(true)}>{overview.bulk_enabled ? 'Start utsendelse' : 'Masseutsendelse deaktivert'}</button>
      </>}
    </section>

    {campaign && <section className="survey-email-deliveries"><h4>Leveringsstatus</h4>
      <div className="admin-table-scroll"><table className="admin-table"><caption>Leveringsstatus per medlem</caption><thead><tr><th scope="col">Medlem</th><th scope="col">Domene</th><th scope="col">Status</th><th scope="col">Merknad</th></tr></thead><tbody>{overview.deliveries.map((delivery) => <tr key={delivery.id}><th scope="row">{delivery.h_number || 'Ukjent'}</th><td>{delivery.recipient_domain}</td><td>{statusLabels[delivery.status] || delivery.status}</td><td>{delivery.failure_reason || '—'}</td></tr>)}</tbody></table></div>
      {overview.pages > 1 && <nav className="survey-email-pages" aria-label="Sider i leveringsstatus"><button className="admin-button" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Forrige</button><span>Side {overview.page} av {overview.pages}</span><button className="admin-button" type="button" disabled={page >= overview.pages} onClick={() => setPage((value) => value + 1)}>Neste</button></nav>}
    </section>}
    {message && <p className={message.includes('akseptert') || message.includes('startet') ? 'admin-success' : 'form-error'} role="status">{message}</p>}
    <ConfirmDialog open={confirmSend} eyebrow="Bekreft utsendelse" destructive={false} title={`Send til ${overview.recipient_count} medlemmer?`} description={canReplace ? 'Dette arkiverer den tidligere utsendelsen og sender nye engangslenker til alle aktuelle mottakere.' : 'Dette starter en personlig e-post til hvert medlem.'} confirmLabel="Start utsendelse" busy={busy === 'send' || busy === 'resend'} onCancel={() => setConfirmSend(false)} onConfirm={() => post(canReplace ? 'resend' : 'send')} />
  </section>;
}
