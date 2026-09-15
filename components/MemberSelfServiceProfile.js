'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MEMBER_COMMENT_MAX_LENGTH } from '@/lib/member-comments';

function formatDate(value) {
  if (!value) return 'Ikke registrert';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Ukjent dato';
  return new Intl.DateTimeFormat('nb-NO', { dateStyle: 'medium', timeStyle: String(value).includes('T') ? 'short' : undefined }).format(date);
}

function statusLabel(status) {
  return ({ sent: 'Sendt', delivered: 'Levert', failed: 'Feilet', bounced: 'Avvist', suppressed: 'Undertrykt', pending: 'Til behandling', approved: 'Godkjent', rejected: 'Avvist' })[status] || status;
}

function changedFieldLabel(field) {
  return ({ primary_contact_name: 'kontaktperson', primary_contact_email: 'hoved-e-post', other_contact_emails: 'andre e-postadresser' })[field] || field;
}

export default function MemberSelfServiceProfile({ initialProfile }) {
  const router = useRouter();
  const [member, setMember] = useState(initialProfile.member);
  const [form, setForm] = useState({
    primary_contact_name: member.primary_contact_name || '',
    primary_contact_email: member.primary_contact_email || '',
    other_contact_emails: (member.other_contact_emails || []).join('\n'),
    comment: '',
  });
  const [transfer, setTransfer] = useState({ primary_contact_name: '', primary_contact_email: '', other_contact_emails: '', comment: '' });
  const [newPrimaryEmail, setNewPrimaryEmail] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  async function submit(action, values) {
    setBusy(action); setMessage(''); setIsError(false);
    try {
      const response = await fetch('/api/member-access/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ action, ...values, memberId: member.id, other_contact_emails: values.other_contact_emails.split(/[\n,;]+/).map((email) => email.trim()).filter(Boolean) }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || 'Endringen kunne ikke lagres.');
      if (body.member) setMember({ ...member, ...body.member });
      setMessage(body.message);
      if (action === 'ownership_transfer') setTransfer({ primary_contact_name: '', primary_contact_email: '', other_contact_emails: '', comment: '' });
      if (action === 'update') setForm((current) => ({ ...current, comment: '' }));
      router.refresh();
    } catch (error) { setMessage(error.message); setIsError(true); }
    finally { setBusy(''); }
  }

  async function logout() {
    setBusy('logout');
    try { await fetch('/api/member-access/logout', { method: 'POST' }); }
    finally { router.push('/#medlemsopplysninger'); router.refresh(); }
  }

  return <div className="member-profile-layout">
    {initialProfile.properties?.length > 1 && <section className="member-profile-section" aria-label="Velg tomt">
      <h2>Dine tomter</h2><p>Lenken gir tilgang til disse tomtene. Kontaktopplysninger og historikk vises separat for hver tomt.</p>
      <nav aria-label="Dine tomter"><ul>{initialProfile.properties.map((property) => <li key={property.id}>
        <Link href={`/mine-opplysninger?member=${property.id}`} prefetch={false} aria-current={String(property.id) === String(member.id) ? 'page' : undefined}>
          {property.h_number} · {property.street_address || 'Adresse ikke registrert'}
        </Link>
      </li>)}</ul></nav>
    </section>}
    <section className="member-profile-section" aria-labelledby="registered-data-title">
      <div className="member-profile-heading"><div><p className="eyebrow">Innsyn</p><h2 id="registered-data-title">Registrerte opplysninger</h2></div><div><Link className="admin-button" href={`/api/member-access/export?member=${member.id}`} prefetch={false}>Last ned som JSON</Link> <button className="admin-button" type="button" onClick={logout} disabled={Boolean(busy)}>Logg ut</button></div></div>
      <dl className="member-readonly-grid">
        <div><dt>H-nummer</dt><dd>{member.h_number || 'Ikke registrert'}</dd></div>
        <div><dt>Gårds- og bruksnummer</dt><dd>{member.cadastral_number || 'Ikke registrert'}</dd></div>
        <div><dt>Seksjonsnummer</dt><dd>{member.section_number || 'Ikke registrert'}</dd></div>
        <div><dt>Gateadresse</dt><dd>{member.street_address || 'Ikke registrert'}</dd></div>
        <div><dt>Hjemmelshaver</dt><dd>{member.title_holder || 'Ikke registrert'}</dd></div>
        <div><dt>Tinglysningsdato</dt><dd>{member.registration_date || 'Ikke registrert'}</dd></div>
      </dl>
      <p className="member-form-note">Eiendomsopplysningene er skrivebeskyttet. Meld eierskifte nedenfor hvis de ikke lenger er riktige.</p>
    </section>

    <section className="member-profile-section" aria-labelledby="contact-data-title">
      <p className="eyebrow">Retting</p><h2 id="contact-data-title">Kontaktopplysninger</h2>
      <form className="member-self-service-form" onSubmit={(event) => { event.preventDefault(); submit('update', form); }}>
        <label>Kontaktperson<input value={form.primary_contact_name} onChange={(event) => setForm({ ...form, primary_contact_name: event.target.value })} maxLength={500} required /></label>
        <label>Hoved-e-post<input type="email" value={form.primary_contact_email} readOnly aria-describedby="primary-email-note" /></label>
        <span id="primary-email-note" className="member-form-note">Hoved-e-post endres separat med kontroll av både gammel og ny adresse.</span>
        <label>Andre e-postadresser<textarea value={form.other_contact_emails} onChange={(event) => setForm({ ...form, other_contact_emails: event.target.value })} rows={3} placeholder="Én adresse per linje" /></label>
        <label>Kommentar til endringen (valgfritt)<textarea value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} maxLength={MEMBER_COMMENT_MAX_LENGTH} rows={3} /></label>
        <p className="member-form-note">Kommentaren vises for administrator. Unngå sensitive personopplysninger. Maks {MEMBER_COMMENT_MAX_LENGTH} tegn.</p>
        <button className="primary-button" type="submit" disabled={busy}>{busy === 'update' ? 'Lagrer …' : 'Lagre kontaktopplysninger'}</button>
      </form>
    </section>

    <section className="member-profile-section" aria-labelledby="email-change-title">
      <p className="eyebrow">Sikker endring</p><h2 id="email-change-title">Endre hoved-e-post</h2>
      <p>Først sender vi en engangsbekreftelse til nåværende hoved-e-post. Etter godkjenning sender vi en ny bekreftelse til den nye adressen.</p>
      <form className="member-self-service-form" onSubmit={(event) => { event.preventDefault(); submit('email_change', { primary_contact_email: newPrimaryEmail, other_contact_emails: '' }); }}>
        <label>Ny hoved-e-post<input type="email" value={newPrimaryEmail} onChange={(event) => setNewPrimaryEmail(event.target.value)} maxLength={254} required /></label>
        <button className="primary-button" type="submit" disabled={Boolean(busy)}>{busy === 'email_change' ? 'Sender …' : 'Start sikker e-postendring'}</button>
      </form>
    </section>

    <section className="member-profile-section" aria-labelledby="ownership-title">
      <p className="eyebrow">Eierskifte</p><h2 id="ownership-title">Meld eierskifte</h2>
      <p>Oppgi kontaktopplysningene til ny eier. Forespørselen merkes som eierskifte og må godkjennes av Turufjell Vel før kontaktfeltene erstattes. Hjemmelshaver og eiendomsdata endres ikke her.</p>
      <form className="member-self-service-form" onSubmit={(event) => { event.preventDefault(); submit('ownership_transfer', transfer); }}>
        <label>Ny kontaktperson<input value={transfer.primary_contact_name} onChange={(event) => setTransfer({ ...transfer, primary_contact_name: event.target.value })} maxLength={500} required /></label>
        <label>Ny hoved-e-post<input type="email" value={transfer.primary_contact_email} onChange={(event) => setTransfer({ ...transfer, primary_contact_email: event.target.value })} maxLength={254} required /></label>
        <label>Nye andre e-postadresser<textarea value={transfer.other_contact_emails} onChange={(event) => setTransfer({ ...transfer, other_contact_emails: event.target.value })} rows={3} placeholder="Én adresse per linje" /></label>
        <label>Kommentar til eierskiftet (valgfritt)<textarea value={transfer.comment} onChange={(event) => setTransfer({ ...transfer, comment: event.target.value })} maxLength={MEMBER_COMMENT_MAX_LENGTH} rows={3} /></label>
        <button className="admin-button" type="submit" disabled={busy}>{busy === 'ownership_transfer' ? 'Sender …' : 'Send eierskifte til behandling'}</button>
      </form>
    </section>

    <section className="member-profile-section" aria-labelledby="survey-data-title">
      <p className="eyebrow">Historikk</p><h2 id="survey-data-title">Undersøkelsessvar</h2>
      {!initialProfile.responses.length ? <p>Ingen svar er registrert.</p> : initialProfile.responses.map((response) => <article className="member-history-card" key={response.id}><h3>{response.survey_title || 'Undersøkelse'}</h3><p>{formatDate(response.created_at)} · spørsmålsversjon {response.question_version}</p><dl>{(response.questions || []).map((question) => <div key={question.id}><dt>{question.text}</dt><dd>{({ ja: 'Ja', nei: 'Nei', usikker: 'Usikker' })[response.answers?.[question.id]] || 'Ikke besvart'}</dd></div>)}</dl></article>)}
    </section>

    <section className="member-profile-section" aria-labelledby="email-history-title">
      <p className="eyebrow">Historikk</p><h2 id="email-history-title">E-postleveringer</h2>
      {!initialProfile.deliveries.length ? <p>Ingen e-postleveringer er registrert.</p> : <ul className="member-history-list">{initialProfile.deliveries.map((delivery, index) => <li key={`${delivery.created_at}-${index}`}><span><strong>{delivery.subject}</strong><small>{formatDate(delivery.created_at)} · {delivery.recipient_email}</small>{delivery.failure_reason && <small>Feilkode: {delivery.failure_reason}</small>}</span><span className="status-pill is-closed">{statusLabel(delivery.status)}</span></li>)}</ul>}
    </section>

    {initialProfile.requests.length > 0 && <section className="member-profile-section" aria-labelledby="request-history-title">
      <p className="eyebrow">Historikk</p><h2 id="request-history-title">Medlemsforespørsler</h2>
      <ul className="member-history-list">{initialProfile.requests.map((request) => <li key={request.id}><span><strong>{request.request_type === 'ownership_transfer' ? 'Eierskifte' : 'Innmelding'}</strong><small>{request.requested_contact_name} · {request.requested_primary_email}</small>{request.requested_other_emails?.length > 0 && <small>Andre: {request.requested_other_emails.join(', ')}</small>}<small>{formatDate(request.created_at)}</small>{request.requested_comment && <p className="member-comment-text">{request.requested_comment}</p>}</span><span className="status-pill is-closed">{statusLabel(request.status)}</span></li>)}</ul>
    </section>}

    {initialProfile.updates.length > 0 && <section className="member-profile-section" aria-labelledby="update-history-title">
      <p className="eyebrow">Historikk</p><h2 id="update-history-title">Egne rettinger</h2>
      <ul className="member-history-list">{initialProfile.updates.map((update, index) => <li key={`${update.created_at}-${index}`}><span><strong>Kontaktopplysninger oppdatert</strong><small>{(update.changed_fields || []).map(changedFieldLabel).join(', ')} · {formatDate(update.created_at)}</small>{update.comment && <p className="member-comment-text">{update.comment}</p>}</span></li>)}</ul>
    </section>}

    <section className="member-profile-section member-privacy-rights" aria-labelledby="privacy-rights-title">
      <p className="eyebrow">Personvern</p><h2 id="privacy-rights-title">Andre personvernrettigheter</h2>
      <p>Du kan også be om sletting, begrensning, dataportabilitet eller protestere mot behandlingen. Slike forespørsler må vurderes konkret og kan sendes til <a href="mailto:post@turufjellvel.no">post@turufjellvel.no</a>.</p>
    </section>
    {message && <p className={`member-profile-message ${isError ? 'form-error' : 'admin-success'}`} role="status">{message}</p>}
  </div>;
}
