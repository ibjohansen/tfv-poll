'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import MemberPropertyMap from '@/components/MemberPropertyMap';

const saveLabels = { saved: 'Alle endringer lagret', dirty: 'Venter på automatisk lagring …', saving: 'Lagrer automatisk …', error: 'Automatisk lagring feilet' };
const propertyFields = [['h_number', 'H-nummer'], ['cadastral_number', 'Gårds- og bruksnummer'], ['section_number', 'Seksjonsnummer']];
const contactFields = [['primary_contact_name', 'Kontaktperson'], ['primary_contact_email', 'Hoved-e-post'], ['other_contact_emails', 'Andre e-postadresser'], ['admin_comment', 'Internt notat – ikke synlig for medlem']];

function formFromMember(member) {
  return { ...member, other_contact_emails: (member.other_contact_emails || []).join('\n') };
}

function payload(form) {
  return {
    primary_contact_name: form.primary_contact_name || '',
    primary_contact_email: form.primary_contact_email || '',
    other_contact_emails: form.other_contact_emails.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean),
    admin_comment: form.admin_comment || '', membership_status: form.membership_status || 'member',
    turufjell_as_sharing_opt_out: Boolean(form.turufjell_as_sharing_opt_out),
  };
}

export default function MapMemberDetails({ memberId, canMatrikkelSync = false, onClose }) {
  const [member, setMember] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState('saved');
  const savedPayload = useRef('');
  const closeButton = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/members/${encodeURIComponent(memberId)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.message || 'Kunne ikke hente medlemmet.');
        const next = formFromMember(body.member);
        setMember(body.member); setForm(next); savedPayload.current = JSON.stringify(payload(next)); setSaveState('saved');
      })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure.message || 'Kunne ikke hente medlemmet.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [memberId]);

  useEffect(() => { closeButton.current?.focus(); }, []);

  const save = useCallback(async (value) => {
    setSaveState('saving'); setError('');
    try {
      const response = await fetch(`/api/admin/members/${encodeURIComponent(memberId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value), signal: AbortSignal.timeout(20_000),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || 'Kunne ikke lagre medlemmet.');
      savedPayload.current = JSON.stringify(value); setMember((current) => ({ ...current, ...body.member })); setSaveState('saved');
    } catch (failure) { setError(failure.message || 'Kunne ikke lagre medlemmet.'); setSaveState('error'); }
  }, [memberId]);

  useEffect(() => {
    if (!form || !memberId) return undefined;
    const value = payload(form);
    if (JSON.stringify(value) === savedPayload.current) return undefined;
    setSaveState('dirty');
    const timer = setTimeout(() => save(value), 900);
    return () => clearTimeout(timer);
  }, [form, memberId, save]);

  const update = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  return <aside className="admin-detail-panel is-open" aria-label="Medlemsdetaljer fra kartet"
    onKeyDown={(event) => { if (event.key === 'Escape' && saveState !== 'saving') onClose(); }}>
    <div className="admin-detail-header"><div><p className="eyebrow">Medlem</p><h2>{member?.h_number || 'Laster …'}</h2>
      {member && <span className={`admin-save-status is-${saveState}`} role="status">{saveLabels[saveState]}</span>}</div>
      <button className="admin-button" type="button" ref={closeButton} onClick={onClose} disabled={saveState === 'saving'}>Lukk</button></div>
    {loading && <p role="status">Henter medlemsdetaljer …</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {form && <form className="admin-detail-form" onSubmit={(event) => { event.preventDefault(); save(payload(form)); }}>
      <div className="map-actions"><Link className="admin-button" href={`/admin/members?member=${encodeURIComponent(memberId)}`}>Åpne i medlemsregisteret</Link>
        {canMatrikkelSync && <Link className="admin-button" href={`/admin/members/matrikkel?member=${encodeURIComponent(memberId)}`}>Oppdater matrikkeldata</Link>}</div>
      <label>Medlemsstatus<select value={form.membership_status || 'member'} onChange={(event) => update('membership_status', event.target.value)}><option value="member">Ordinært medlem</option><option value="exempt">Unntatt medlemskap</option></select></label>
      <label className="admin-checkbox"><input type="checkbox" checked={Boolean(form.turufjell_as_sharing_opt_out)} onChange={(event) => update('turufjell_as_sharing_opt_out', event.target.checked)} /> Reservert mot deling av kontaktinformasjon med Turufjell AS</label>
      <div className="admin-detail-field-grid is-property">{propertyFields.map(([name, label]) => <div className="admin-detail-field" key={name}><label>{label}<input value={form[name] || ''} readOnly /></label></div>)}</div>
      <div className="admin-detail-field"><label>Gateadresse<input value={form.street_address || ''} readOnly /></label></div>
      <div className="admin-detail-field-grid is-ownership"><div className="admin-detail-field"><label>Hjemmelshaver<textarea value={(form.title_holder || '').split(/\s*\/\s*/).join('\n')} rows="3" readOnly /></label></div>
        <div className="admin-detail-field"><label>Tinglysningsdato<textarea value={(form.registration_date || '').split(/\s*\/\s*/).join('\n')} rows="3" readOnly /></label></div></div>
      {!form.title_holder && <p className="map-warning">Ingen hjemmelshaver er funnet i medlemsregisteret.</p>}
      {form.street_address && <MemberPropertyMap streetAddress={form.street_address} />}
      {member.hamlet_name && <p><strong>Grend:</strong> {member.hamlet_name}</p>}
      {contactFields.map(([name, label]) => <div className="admin-detail-field" key={name}><label>{label}{['other_contact_emails', 'admin_comment'].includes(name)
        ? <textarea value={form[name] || ''} onChange={(event) => update(name, event.target.value)} rows={name === 'admin_comment' ? 5 : 3} />
        : <input value={form[name] || ''} onChange={(event) => update(name, event.target.value)} />}</label></div>)}
      <button className="primary-button" type="submit" disabled={saveState === 'saving'}>{saveState === 'saving' ? 'Lagrer …' : 'Lagre nå'}</button>
    </form>}
  </aside>;
}
