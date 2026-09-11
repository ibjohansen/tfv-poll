'use client';

import { useState } from 'react';

const emptyMembership = {
  h_number: '', cadastral_number: '', section_number: '', street_address: '', primary_contact_name: '',
  primary_contact_email: '', other_contact_emails: '',
};

export default function MemberSelfServiceEntry({ membershipStatus = '' }) {
  const [mode, setMode] = useState('access');
  const [identifier, setIdentifier] = useState('');
  const [membership, setMembership] = useState(emptyMembership);
  const [busy, setBusy] = useState('');
  const [matchedIdentifier, setMatchedIdentifier] = useState('');
  const [message, setMessage] = useState(
    membershipStatus === 'verified' ? 'E-postadressen er bekreftet. Innmeldingen er sendt til behandling.'
      : membershipStatus === 'invalid' ? 'Bekreftelseslenken er ugyldig eller utløpt.' : '',
  );
  const [isError, setIsError] = useState(membershipStatus === 'invalid');

  async function submitAccess(event) {
    event.preventDefault();
    setBusy('search'); setMessage(''); setIsError(false);
    try {
      const response = await fetch('/api/member-access/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'search', identifier }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || 'Forespørselen kunne ikke behandles.');
      setMessage(body.message); setIsError(body.found === false);
      setMatchedIdentifier(body.found && body.canSend ? identifier : '');
    } catch (error) { setMessage(error.message); setIsError(true); }
    finally { setBusy(''); }
  }

  async function sendAccessLink() {
    setBusy('send'); setMessage(''); setIsError(false);
    try {
      const response = await fetch('/api/member-access/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', identifier: matchedIdentifier }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || 'Lenken kunne ikke sendes.');
      setMessage(body.message); setIsError(body.found === false || body.canSend === false);
      setMatchedIdentifier('');
    } catch (error) { setMessage(error.message); setIsError(true); }
    finally { setBusy(''); }
  }

  async function submitMembership(event) {
    event.preventDefault();
    setBusy('membership'); setMessage(''); setIsError(false);
    try {
      const response = await fetch('/api/membership-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...membership, other_contact_emails: membership.other_contact_emails.split(/[\n,;]+/).map((email) => email.trim()).filter(Boolean) }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || 'Forespørselen kunne ikke behandles.');
      setMessage(body.message); setMembership(emptyMembership);
    } catch (error) { setMessage(error.message); setIsError(true); }
    finally { setBusy(''); }
  }

  return <section id="medlemsopplysninger" className="member-self-service-entry" aria-labelledby="member-self-service-title">
    <div className="member-self-service-intro">
      <p className="eyebrow">Medlemsservice</p>
      <h2 id="member-self-service-title">Mine medlemsopplysninger</h2>
      <p>Be om en sikker lenke for å se hva vi har registrert, rette kontaktopplysninger eller melde eierskifte. Lenken sendes til registrert hoved-e-post og varer i 24 timer.</p>
    </div>
    <div className="member-self-service-box">
      <div className="member-self-service-tabs" role="tablist" aria-label="Velg medlemstjeneste">
        <button type="button" role="tab" aria-selected={mode === 'access'} onClick={() => { setMode('access'); setMessage(''); setMatchedIdentifier(''); }}>Jeg er registrert</button>
        <button type="button" role="tab" aria-selected={mode === 'membership'} onClick={() => { setMode('membership'); setMessage(''); setMatchedIdentifier(''); }}>Meld inn ny tomt</button>
      </div>
      {mode === 'access' ? <form className="member-self-service-form" onSubmit={submitAccess}>
        <label htmlFor="member-identifier">H-nummer, gateadresse eller e-postadresse
          <input id="member-identifier" value={identifier} onChange={(event) => { setIdentifier(event.target.value); setMatchedIdentifier(''); setMessage(''); }} maxLength={320} required />
        </label>
        <p>Ved treff viser vi bare tomten, adressen og en maskert hoved-e-post. Den sikre lenken sendes alltid til den fullstendige registrerte hovedadressen.</p>
        <button className={matchedIdentifier ? 'admin-button' : 'primary-button'} type="submit" disabled={Boolean(busy)}>{busy === 'search' ? 'Søker …' : 'Søk'}</button>
        {message && <p className={isError ? 'form-error' : 'admin-success'} role="status">{message}</p>}
        {matchedIdentifier && <button className="primary-button" type="button" onClick={sendAccessLink} disabled={Boolean(busy)}>{busy === 'send' ? 'Sender …' : 'Send meg en sikker lenke'}</button>}
      </form> : <form className="member-self-service-form membership-request-form" onSubmit={submitMembership}>
        <p>Bruk dette skjemaet bare når verken tomten eller adressen finnes i medlemsregisteret. Innmeldingen behandles av Turufjell vel etter at e-postadressen er bekreftet.</p>
        <div className="member-form-grid">
          <label>H-nummer<input value={membership.h_number} onChange={(event) => setMembership({ ...membership, h_number: event.target.value })} maxLength={100} /></label>
          <label>Gateadresse<input value={membership.street_address} onChange={(event) => setMembership({ ...membership, street_address: event.target.value })} maxLength={500} /></label>
          <label>Gårds- og bruksnummer<input value={membership.cadastral_number} onChange={(event) => setMembership({ ...membership, cadastral_number: event.target.value })} maxLength={50} inputMode="numeric" placeholder="10/770" /></label>
          <label>Seksjonsnummer (valgfritt)<input value={membership.section_number} onChange={(event) => setMembership({ ...membership, section_number: event.target.value })} maxLength={20} inputMode="numeric" placeholder="For eksempel 3" /></label>
        </div>
        <span className="member-form-note">Minst H-nummer eller gateadresse må fylles ut. Bruk formatet 10/770 for gårds- og bruksnummer. Oppgi seksjonsnummer hvis eiendommen er seksjonert.</span>
        <label>Kontaktperson<input value={membership.primary_contact_name} onChange={(event) => setMembership({ ...membership, primary_contact_name: event.target.value })} maxLength={500} autoComplete="name" required /></label>
        <label>Hoved-e-post<input type="email" value={membership.primary_contact_email} onChange={(event) => setMembership({ ...membership, primary_contact_email: event.target.value })} maxLength={254} autoComplete="email" required /></label>
        <label>Andre e-postadresser<textarea value={membership.other_contact_emails} onChange={(event) => setMembership({ ...membership, other_contact_emails: event.target.value })} rows={3} placeholder="Én adresse per linje" /></label>
        <button className="primary-button" type="submit" disabled={Boolean(busy) || (!membership.h_number.trim() && !membership.street_address.trim())}>{busy === 'membership' ? 'Sender …' : 'Send innmelding'}</button>
      </form>}
      {mode === 'membership' && message && <p className={isError ? 'form-error' : 'admin-success'} role="status">{message}</p>}
    </div>
  </section>;
}
