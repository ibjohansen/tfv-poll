'use client';

import { useState } from 'react';

const emptyMembership = {
  h_number: '', street_address: '', primary_contact_name: '',
  primary_contact_email: '', other_contact_emails: '',
};

export default function MemberSelfServiceEntry({ membershipStatus = '' }) {
  const [mode, setMode] = useState('access');
  const [identifier, setIdentifier] = useState('');
  const [membership, setMembership] = useState(emptyMembership);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    membershipStatus === 'verified' ? 'E-postadressen er bekreftet. Innmeldingen er sendt til behandling.'
      : membershipStatus === 'invalid' ? 'Bekreftelseslenken er ugyldig eller utløpt.' : '',
  );
  const [isError, setIsError] = useState(membershipStatus === 'invalid');

  async function submitAccess(event) {
    event.preventDefault();
    setBusy(true); setMessage(''); setIsError(false);
    try {
      const response = await fetch('/api/member-access/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || 'Forespørselen kunne ikke behandles.');
      setMessage(body.message); setIdentifier('');
    } catch (error) { setMessage(error.message); setIsError(true); }
    finally { setBusy(false); }
  }

  async function submitMembership(event) {
    event.preventDefault();
    setBusy(true); setMessage(''); setIsError(false);
    try {
      const response = await fetch('/api/membership-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...membership, other_contact_emails: membership.other_contact_emails.split(/[\n,;]+/).map((email) => email.trim()).filter(Boolean) }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || 'Forespørselen kunne ikke behandles.');
      setMessage(body.message); setMembership(emptyMembership);
    } catch (error) { setMessage(error.message); setIsError(true); }
    finally { setBusy(false); }
  }

  return <section id="medlemsopplysninger" className="member-self-service-entry" aria-labelledby="member-self-service-title">
    <div className="member-self-service-intro">
      <p className="eyebrow">Medlemsservice</p>
      <h2 id="member-self-service-title">Mine medlemsopplysninger</h2>
      <p>Be om en sikker lenke for å se hva vi har registrert, rette kontaktopplysninger eller melde eierskifte. Lenken sendes til registrert hoved-e-post og varer i 24 timer.</p>
    </div>
    <div className="member-self-service-box">
      <div className="member-self-service-tabs" role="tablist" aria-label="Velg medlemstjeneste">
        <button type="button" role="tab" aria-selected={mode === 'access'} onClick={() => { setMode('access'); setMessage(''); }}>Jeg er registrert</button>
        <button type="button" role="tab" aria-selected={mode === 'membership'} onClick={() => { setMode('membership'); setMessage(''); }}>Meld inn ny tomt</button>
      </div>
      {mode === 'access' ? <form className="member-self-service-form" onSubmit={submitAccess}>
        <label htmlFor="member-identifier">H-nummer, gateadresse eller e-postadresse
          <input id="member-identifier" value={identifier} onChange={(event) => setIdentifier(event.target.value)} maxLength={320} required />
        </label>
        <p>Av hensyn til personvernet får du samme svar uansett om opplysningen finnes i registeret.</p>
        <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Sender …' : 'Send meg sikker lenke'}</button>
      </form> : <form className="member-self-service-form membership-request-form" onSubmit={submitMembership}>
        <p>Bruk dette skjemaet bare når verken tomten eller adressen finnes i medlemsregisteret. Innmeldingen behandles av Turufjell vel etter at e-postadressen er bekreftet.</p>
        <div className="member-form-grid">
          <label>H-nummer<input value={membership.h_number} onChange={(event) => setMembership({ ...membership, h_number: event.target.value })} maxLength={100} /></label>
          <label>Gateadresse<input value={membership.street_address} onChange={(event) => setMembership({ ...membership, street_address: event.target.value })} maxLength={500} /></label>
        </div>
        <span className="member-form-note">Minst H-nummer eller gateadresse må fylles ut.</span>
        <label>Kontaktperson<input value={membership.primary_contact_name} onChange={(event) => setMembership({ ...membership, primary_contact_name: event.target.value })} maxLength={500} autoComplete="name" required /></label>
        <label>Hoved-e-post<input type="email" value={membership.primary_contact_email} onChange={(event) => setMembership({ ...membership, primary_contact_email: event.target.value })} maxLength={254} autoComplete="email" required /></label>
        <label>Andre e-postadresser<textarea value={membership.other_contact_emails} onChange={(event) => setMembership({ ...membership, other_contact_emails: event.target.value })} rows={3} placeholder="Én adresse per linje" /></label>
        <button className="primary-button" type="submit" disabled={busy || (!membership.h_number.trim() && !membership.street_address.trim())}>{busy ? 'Sender …' : 'Send innmelding'}</button>
      </form>}
      {message && <p className={isError ? 'form-error' : 'admin-success'} role="status">{message}</p>}
    </div>
  </section>;
}
