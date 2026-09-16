'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import MemberPropertyMap from '@/components/MemberPropertyMap';
import { useI18n } from '@/components/LocaleProvider';

const propertyFields = ['h_number', 'cadastral_number', 'section_number'];
const contactFields = ['primary_contact_name', 'primary_contact_email', 'other_contact_emails', 'admin_comment'];

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
  const { t } = useI18n('map.admin.memberDetails');
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
        if (!response.ok || !body.ok) throw new Error(body.message || t('fetchError'));
        const next = formFromMember(body.member);
        setMember(body.member); setForm(next); savedPayload.current = JSON.stringify(payload(next)); setSaveState('saved');
      })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure.message || t('fetchError')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [memberId, t]);

  useEffect(() => { closeButton.current?.focus(); }, []);

  const save = useCallback(async (value) => {
    setSaveState('saving'); setError('');
    try {
      const response = await fetch(`/api/admin/members/${encodeURIComponent(memberId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value), signal: AbortSignal.timeout(20_000),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || t('saveError'));
      savedPayload.current = JSON.stringify(value); setMember((current) => ({ ...current, ...body.member })); setSaveState('saved');
    } catch (failure) { setError(failure.message || t('saveError')); setSaveState('error'); }
  }, [memberId, t]);

  useEffect(() => {
    if (!form || !memberId) return undefined;
    const value = payload(form);
    if (JSON.stringify(value) === savedPayload.current) return undefined;
    setSaveState('dirty');
    const timer = setTimeout(() => save(value), 900);
    return () => clearTimeout(timer);
  }, [form, memberId, save]);

  const update = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  return <aside className="admin-detail-panel is-open" aria-label={t('region')}
    onKeyDown={(event) => { if (event.key === 'Escape' && saveState !== 'saving') onClose(); }}>
    <div className="admin-detail-header"><div><p className="eyebrow">{t('eyebrow')}</p><h2>{member?.h_number || t('loadingTitle')}</h2>
      {member && <span className={`admin-save-status is-${saveState}`} role="status">{t(`saveStates.${saveState}`)}</span>}</div>
      <button className="admin-button" type="button" ref={closeButton} onClick={onClose} disabled={saveState === 'saving'}>{t('close')}</button></div>
    {loading && <p role="status">{t('loading')}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {form && <form className="admin-detail-form" onSubmit={(event) => { event.preventDefault(); save(payload(form)); }}>
      <div className="map-actions"><Link className="admin-button" href={`/admin/members?member=${encodeURIComponent(memberId)}`}>{t('openRegister')}</Link>
        {canMatrikkelSync && <Link className="admin-button" href={`/admin/members/matrikkel?member=${encodeURIComponent(memberId)}`}>{t('updateCadastral')}</Link>}</div>
      <label>{t('membershipStatus')}<select value={form.membership_status || 'member'} onChange={(event) => update('membership_status', event.target.value)}><option value="member">{t('regularMember')}</option><option value="exempt">{t('exempt')}</option></select></label>
      <label className="admin-checkbox"><input type="checkbox" checked={Boolean(form.turufjell_as_sharing_opt_out)} onChange={(event) => update('turufjell_as_sharing_opt_out', event.target.checked)} /> {t('sharingOptOut')}</label>
      <div className="admin-detail-field-grid is-property">{propertyFields.map((name) => <div className="admin-detail-field" key={name}><label>{t(`fields.${name}`)}<input value={form[name] || ''} readOnly /></label></div>)}</div>
      <div className="admin-detail-field"><label>{t('streetAddress')}<input value={form.street_address || ''} readOnly /></label></div>
      <div className="admin-detail-field-grid is-ownership"><div className="admin-detail-field"><label>{t('titleHolder')}<textarea value={(form.title_holder || '').split(/\s*\/\s*/).join('\n')} rows="3" readOnly /></label></div>
        <div className="admin-detail-field"><label>{t('registrationDate')}<textarea value={(form.registration_date || '').split(/\s*\/\s*/).join('\n')} rows="3" readOnly /></label></div></div>
      {!form.title_holder && <p className="map-warning">{t('noOwner')}</p>}
      {form.street_address && <MemberPropertyMap streetAddress={form.street_address} />}
      {member.hamlet_name && <p><strong>{t('hamlet')}:</strong> {member.hamlet_name}</p>}
      {contactFields.map((name) => <div className="admin-detail-field" key={name}><label>{t(`fields.${name}`)}{['other_contact_emails', 'admin_comment'].includes(name)
        ? <textarea value={form[name] || ''} onChange={(event) => update(name, event.target.value)} rows={name === 'admin_comment' ? 5 : 3} />
        : <input value={form[name] || ''} onChange={(event) => update(name, event.target.value)} />}</label></div>)}
      <button className="primary-button" type="submit" disabled={saveState === 'saving'}>{saveState === 'saving' ? t('saving') : t('saveNow')}</button>
    </form>}
  </aside>;
}
