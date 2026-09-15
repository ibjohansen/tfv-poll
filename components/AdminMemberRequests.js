'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ConfirmDialog';

function requestTitle(request) {
  if (request.request_type === 'profile_update') return `Kommentar til retting · ${request.h_number}`;
  return request.request_type === 'ownership_transfer' ? `Eierskifte · ${request.h_number}` : `Ny innmelding · ${request.h_number || request.street_address}`;
}

function decisionDescription(decision) {
  if (!decision) return '';
  const warning = decision.request.status === 'pending_verification'
    ? 'E-postadressen er ikke bekreftet av innsender. Saksbehandleren overstyrer e-postbekreftelsen. '
    : '';
  if (decision.action === 'reject') return `${warning}Forespørselen markeres som avvist uten å endre medlemmet.`;
  if (decision.request.request_type === 'ownership_transfer') return `${warning}Kontaktperson og e-postadresser erstattes. Eiendomsopplysningene forblir uendret.`;
  return `${warning}Det opprettes et nytt medlem. Eiendomsopplysningene kan kompletteres gjennom ordinær kontroll.`;
}

export default function AdminMemberRequests({ initialRequests, showEmpty = false }) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [decision, setDecision] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [propertyDrafts, setPropertyDrafts] = useState(() => Object.fromEntries(initialRequests.map((request) => [request.id, {
    cadastral_number: request.cadastral_number || '', section_number: request.section_number || '',
  }])));
  if (!requests.length && !message && !showEmpty) return null;

  async function resolve() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/admin/member-requests/${decision.request.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: decision.action }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || 'Forespørselen kunne ikke behandles.');
      setRequests((current) => current.filter((request) => request.id !== decision.request.id));
      setMessage(decision.action === 'approve' ? 'Forespørselen er godkjent.' : 'Forespørselen er avvist.');
      setDecision(null); router.refresh();
    } catch (error) { setMessage(error.message); setDecision(null); }
    finally { setBusy(false); }
  }

  async function acknowledge(request) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/admin/member-requests/${request.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'acknowledge_comment' }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || 'Kommentaren kunne ikke markeres som lest.');
      setRequests((current) => current.filter((item) => item.id !== request.id));
      setMessage('Kommentaren er markert som lest. Historikken er beholdt.'); router.refresh();
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  async function updateProperty(request, action) {
    const draft = propertyDrafts[request.id] || {};
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/admin/member-requests/${request.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...draft }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || 'Matrikkelopplysningene kunne ikke behandles.');
      setRequests((current) => current.map((item) => item.id === request.id ? { ...item, ...body.request } : item));
      setMessage(action === 'check_property' && body.request.matrikkel_review?.status === 'verified'
        ? 'Matrikkelenheten er verifisert.'
        : action === 'confirm_property' ? 'Matrikkelopplysningene er bekreftet manuelt.'
          : body.request.matrikkel_review?.message || 'Kontrollen krever manuell oppfølging.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  function setPropertyDraft(requestId, changes) {
    setPropertyDrafts((current) => ({ ...current, [requestId]: { ...current[requestId], ...changes } }));
  }

  return <section className="admin-member-requests" aria-labelledby="member-requests-title">
    <div className="admin-section-header"><div><p className="eyebrow">Til behandling</p><h2 id="member-requests-title">Henvendelser</h2></div><span>{requests.length}</span></div>
    {!requests.length && <p className="admin-inbox-empty">Oppgavelisten er tom. Nye innmeldinger og eierskifter vises her, også før e-postadressen er bekreftet.</p>}
    {requests.length > 0 && <div className="admin-member-request-list">{requests.map((request) => <article key={request.id}>
      {request.requested_comment && <section aria-label="Kommentar fra medlem"><strong>Inneholder kommentar fra medlem</strong><p className="member-comment-text">{request.requested_comment}</p></section>}
      <div className="admin-member-request-summary"><h3>{requestTitle(request)}</h3><p>{request.street_address || 'Adresse ikke oppgitt'} · {request.title_holder || 'Ingen registrert hjemmelshaver'}</p><span className={`admin-request-verification ${request.status === 'pending_verification' ? 'is-unverified' : 'is-verified'}`}>{request.status === 'pending_verification' ? 'Ikke bekreftet av innsender' : 'E-post bekreftet'}</span></div>
      <dl><div><dt>Gnr./bnr.</dt><dd>{request.cadastral_number || 'Ikke oppgitt'}</dd></div><div><dt>Seksjon</dt><dd>{request.section_number || 'Ikke oppgitt'}</dd></div><div><dt>Ny kontaktperson</dt><dd>{request.requested_contact_name}</dd></div><div><dt>Ny hoved-e-post</dt><dd>{request.requested_primary_email}</dd></div><div><dt>Andre adresser</dt><dd>{request.requested_other_emails?.join(', ') || 'Ingen'}</dd></div></dl>
      {request.request_type === 'membership' && <section className={`admin-property-review is-${request.matrikkel_review?.status || 'pending'}`} aria-label="Matrikkelavklaring">
        <strong>{['verified', 'manual'].includes(request.matrikkel_review?.status) ? 'Matrikkelopplysninger avklart' : 'Matrikkelkontroll påkrevd'}</strong>
        <p>{request.matrikkel_review?.message || 'Denne innmeldingen er ikke kontrollert mot Matrikkelen ennå.'}</p>
        {request.matrikkel_review?.candidates?.length > 0 && <ul>{request.matrikkel_review.candidates.map((candidate) => <li key={`${candidate.gnr}/${candidate.bnr}/${candidate.snr}`}><button type="button" onClick={() => setPropertyDraft(request.id, { cadastral_number: `${candidate.gnr}/${candidate.bnr}`, section_number: candidate.snr === '0' ? '' : candidate.snr })}>{candidate.address}: {candidate.gnr}/{candidate.bnr}{candidate.snr !== '0' ? `, seksjon ${candidate.snr}` : ''}</button></li>)}</ul>}
        <div className="admin-property-fields">
          <label>Gårds-/bruksnummer<input value={propertyDrafts[request.id]?.cadastral_number || ''} onChange={(event) => setPropertyDraft(request.id, { cadastral_number: event.target.value })} placeholder="10/770" /></label>
          <label>Seksjonsnummer<input value={propertyDrafts[request.id]?.section_number || ''} onChange={(event) => setPropertyDraft(request.id, { section_number: event.target.value })} inputMode="numeric" placeholder="Valgfritt" /></label>
        </div>
        <div className="admin-property-actions"><button className="admin-button" type="button" disabled={busy} onClick={() => updateProperty(request, 'check_property')}>Kontroller i Matrikkelen</button><button className="admin-button" type="button" disabled={busy} onClick={() => updateProperty(request, 'confirm_property')}>Bekreft manuelt</button></div>
      </section>}
      {request.request_type === 'profile_update' ? <div className="admin-member-request-actions"><p>Kontaktopplysningene er allerede rettet av medlemmet.</p><button className="admin-button" type="button" disabled={busy} onClick={() => acknowledge(request)}>Marker kommentar som lest</button></div>
        : <div className="admin-member-request-actions"><button className="admin-button" type="button" disabled={busy} onClick={() => setDecision({ request, action: 'reject' })}>Avvis</button><button className="primary-button" type="button" disabled={busy || (request.request_type === 'membership' && !['verified', 'manual'].includes(request.matrikkel_review?.status))} onClick={() => setDecision({ request, action: 'approve' })}>Godkjenn</button></div>}
    </article>)}</div>}
    {message && <p className={/(godkjent|avvist|verifisert|bekreftet)/i.test(message) ? 'admin-success' : 'form-error'} role="status">{message}</p>}
    <ConfirmDialog open={Boolean(decision)} eyebrow={decision?.request.status === 'pending_verification' ? 'Ubekreftet henvendelse' : 'Bekreft behandling'} destructive={decision?.action === 'reject'} title={decision ? `${decision.action === 'approve' ? 'Godkjenne' : 'Avvise'} «${requestTitle(decision.request)}»?` : ''} description={decisionDescription(decision)} confirmLabel={decision?.action === 'approve' && decision?.request.status === 'pending_verification' ? 'Godkjenn likevel' : decision?.action === 'approve' ? 'Godkjenn' : 'Avvis'} busy={busy} onCancel={() => setDecision(null)} onConfirm={resolve} />
  </section>;
}
