'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ConfirmDialog';

function requestTitle(request) {
  return request.request_type === 'ownership_transfer' ? `Eierskifte · ${request.h_number}` : `Ny innmelding · ${request.h_number || request.street_address}`;
}

export default function AdminMemberRequests({ initialRequests }) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [decision, setDecision] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!requests.length && !message) return null;

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

  return <section className="admin-member-requests" aria-labelledby="member-requests-title">
    <div className="admin-section-header"><div><p className="eyebrow">Til behandling</p><h2 id="member-requests-title">Medlemsforespørsler</h2></div><span>{requests.length}</span></div>
    {requests.length > 0 && <div className="admin-member-request-list">{requests.map((request) => <article key={request.id}>
      <div><h3>{requestTitle(request)}</h3><p>{request.street_address || 'Adresse ikke oppgitt'} · {request.title_holder || 'Ingen registrert hjemmelshaver'}</p></div>
      <dl><div><dt>Ny kontaktperson</dt><dd>{request.requested_contact_name}</dd></div><div><dt>Ny hoved-e-post</dt><dd>{request.requested_primary_email}</dd></div><div><dt>Andre adresser</dt><dd>{request.requested_other_emails?.join(', ') || 'Ingen'}</dd></div></dl>
      <div className="admin-member-request-actions"><button className="admin-button" type="button" onClick={() => setDecision({ request, action: 'reject' })}>Avvis</button><button className="primary-button" type="button" onClick={() => setDecision({ request, action: 'approve' })}>Godkjenn</button></div>
    </article>)}</div>}
    {message && <p className={message.includes('godkjent') || message.includes('avvist') ? 'admin-success' : 'form-error'} role="status">{message}</p>}
    <ConfirmDialog open={Boolean(decision)} eyebrow="Bekreft behandling" destructive={decision?.action === 'reject'} title={decision ? `${decision.action === 'approve' ? 'Godkjenne' : 'Avvise'} «${requestTitle(decision.request)}»?` : ''} description={decision?.request.request_type === 'ownership_transfer' && decision?.action === 'approve' ? 'Kontaktperson og e-postadresser erstattes. Eiendomsopplysningene forblir uendret.' : decision?.action === 'approve' ? 'Det opprettes et nytt medlem. Eiendomsopplysningene kan kompletteres gjennom ordinær kontroll.' : 'Forespørselen markeres som avvist uten å endre medlemmet.'} confirmLabel={decision?.action === 'approve' ? 'Godkjenn' : 'Avvis'} busy={busy} onCancel={() => setDecision(null)} onConfirm={resolve} />
  </section>;
}
