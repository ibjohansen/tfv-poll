'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MEMBER_COMMENT_MAX_LENGTH } from '@/lib/member-comments';
import { useI18n } from '@/components/LocaleProvider';

function formatDate(value, formatLocale, t) {
  if (!value) return t('notRegistered');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t('unknownDate');
  return new Intl.DateTimeFormat(formatLocale, { dateStyle: 'medium', timeStyle: String(value).includes('T') ? 'short' : undefined }).format(date);
}

export default function MemberSelfServiceProfile({ initialProfile }) {
  const { t, formatLocale } = useI18n('members.profile');
  const statusLabel = (status) => t(`statuses.${status}`, {}, status);
  const changedFieldLabel = (field) => t(`fields.${field}`, {}, field);
  const displayDate = (value) => formatDate(value, formatLocale, t);
  const router = useRouter();
  const [member, setMember] = useState(initialProfile.member);
  const [form, setForm] = useState({
    primary_contact_name: member.primary_contact_name || '',
    primary_contact_email: member.primary_contact_email || '',
    other_contact_emails: (member.other_contact_emails || []).join('\n'),
    turufjell_as_sharing_opt_out: Boolean(member.turufjell_as_sharing_opt_out),
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
      if (!response.ok || !body.ok) throw new Error(body.message || t('saveError'));
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
    {initialProfile.properties?.length > 1 && <section className="member-profile-section" aria-label={t('selectProperty')}>
      <h2>{t('yourProperties')}</h2><p>{t('propertiesHelp')}</p>
      <nav aria-label={t('yourProperties')}><ul>{initialProfile.properties.map((property) => <li key={property.id}>
        <Link href={`/mine-opplysninger?member=${property.id}`} prefetch={false} aria-current={String(property.id) === String(member.id) ? 'page' : undefined}>
          {property.h_number} · {property.street_address || t('addressMissing')}
        </Link>
      </li>)}</ul></nav>
    </section>}
    <section className="member-profile-section" aria-labelledby="registered-data-title">
      <div className="member-profile-heading"><div><p className="eyebrow">{t('insight')}</p><h2 id="registered-data-title">{t('registeredData')}</h2></div><div><Link className="admin-button" href={`/api/member-access/export?member=${member.id}`} prefetch={false}>{t('downloadJson')}</Link> <button className="admin-button" type="button" onClick={logout} disabled={Boolean(busy)}>{t('logout')}</button></div></div>
      <dl className="member-readonly-grid">
        <div><dt>{t('fields.hNumber')}</dt><dd>{member.h_number || t('notRegistered')}</dd></div>
        <div><dt>{t('fields.cadastralNumber')}</dt><dd>{member.cadastral_number || t('notRegistered')}</dd></div>
        <div><dt>{t('fields.sectionNumber')}</dt><dd>{member.section_number || t('notRegistered')}</dd></div>
        <div><dt>{t('fields.streetAddress')}</dt><dd>{member.street_address || t('notRegistered')}</dd></div>
        <div><dt>{t('fields.titleHolder')}</dt><dd>{member.title_holder || t('notRegistered')}</dd></div>
        <div><dt>{t('fields.registrationDate')}</dt><dd>{member.registration_date || t('notRegistered')}</dd></div>
      </dl>
      <p className="member-form-note">{t('readonly')}</p>
    </section>

    <section className="member-profile-section" aria-labelledby="contact-data-title">
      <p className="eyebrow">{t('correction')}</p><h2 id="contact-data-title">{t('contactAndSharing')}</h2>
      <form className="member-self-service-form" onSubmit={(event) => { event.preventDefault(); submit('update', form); }}>
        <label>{t('fields.primary_contact_name')}<input value={form.primary_contact_name} onChange={(event) => setForm({ ...form, primary_contact_name: event.target.value })} maxLength={500} required /></label>
        <label>{t('fields.primary_contact_email')}<input type="email" value={form.primary_contact_email} readOnly aria-describedby="primary-email-note" /></label>
        <span id="primary-email-note" className="member-form-note">{t('emailNote')}</span>
        <label>{t('fields.other_contact_emails')}<textarea value={form.other_contact_emails} onChange={(event) => setForm({ ...form, other_contact_emails: event.target.value })} rows={3} placeholder={t('emailsPlaceholder')} /></label>
        <label className="member-sharing-opt-out"><input type="checkbox" checked={form.turufjell_as_sharing_opt_out} onChange={(event) => setForm({ ...form, turufjell_as_sharing_opt_out: event.target.checked })} />
          <span><strong>{t('optOut')}</strong><small>{t('optOutHelp')}</small></span>
        </label>
        <label>{t('optionalComment')}<textarea value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} maxLength={MEMBER_COMMENT_MAX_LENGTH} rows={3} /></label>
        <p className="member-form-note">{t('commentHelp', {count: MEMBER_COMMENT_MAX_LENGTH})}</p>
        <button className="primary-button" type="submit" disabled={busy}>{busy === 'update' ? t('saving') : t('save')}</button>
      </form>
    </section>

    <section className="member-profile-section" aria-labelledby="email-change-title">
      <p className="eyebrow">{t('secureChange')}</p><h2 id="email-change-title">{t('changeEmail')}</h2>
      <p>{t('changeEmailHelp')}</p>
      <form className="member-self-service-form" onSubmit={(event) => { event.preventDefault(); submit('email_change', { primary_contact_email: newPrimaryEmail, other_contact_emails: '' }); }}>
        <label>{t('newEmail')}<input type="email" value={newPrimaryEmail} onChange={(event) => setNewPrimaryEmail(event.target.value)} maxLength={254} required /></label>
        <button className="primary-button" type="submit" disabled={Boolean(busy)}>{busy === 'email_change' ? t('sending') : t('startEmailChange')}</button>
      </form>
    </section>

    <section className="member-profile-section" aria-labelledby="ownership-title">
      <p className="eyebrow">{t('ownership')}</p><h2 id="ownership-title">{t('reportOwnership')}</h2>
      <p>{t('ownershipHelp')}</p>
      <form className="member-self-service-form" onSubmit={(event) => { event.preventDefault(); submit('ownership_transfer', transfer); }}>
        <label>{t('newContact')}<input value={transfer.primary_contact_name} onChange={(event) => setTransfer({ ...transfer, primary_contact_name: event.target.value })} maxLength={500} required /></label>
        <label>{t('newEmail')}<input type="email" value={transfer.primary_contact_email} onChange={(event) => setTransfer({ ...transfer, primary_contact_email: event.target.value })} maxLength={254} required /></label>
        <label>{t('newOtherEmails')}<textarea value={transfer.other_contact_emails} onChange={(event) => setTransfer({ ...transfer, other_contact_emails: event.target.value })} rows={3} placeholder={t('emailsPlaceholder')} /></label>
        <label>{t('ownershipComment')}<textarea value={transfer.comment} onChange={(event) => setTransfer({ ...transfer, comment: event.target.value })} maxLength={MEMBER_COMMENT_MAX_LENGTH} rows={3} /></label>
        <button className="admin-button" type="submit" disabled={busy}>{busy === 'ownership_transfer' ? t('sending') : t('submitOwnership')}</button>
      </form>
    </section>

    <section className="member-profile-section" aria-labelledby="survey-data-title">
      <p className="eyebrow">{t('history')}</p><h2 id="survey-data-title">{t('surveyAnswers')}</h2>
      {!initialProfile.responses.length ? <p>{t('noAnswers')}</p> : initialProfile.responses.map((response) => <article className="member-history-card" key={response.id}><h3>{response.survey_title || t('survey')}</h3><p>{displayDate(response.created_at)} · {t('questionVersion', {version: response.question_version})}</p><dl>{(response.questions || []).map((question) => <div key={question.id}><dt>{question.text}</dt><dd>{t(`answers.${response.answers?.[question.id]}`, {}, t('unanswered'))}</dd></div>)}</dl></article>)}
    </section>

    <section className="member-profile-section" aria-labelledby="email-history-title">
      <p className="eyebrow">{t('history')}</p><h2 id="email-history-title">{t('deliveries')}</h2>
      {!initialProfile.deliveries.length ? <p>{t('noDeliveries')}</p> : <ul className="member-history-list">{initialProfile.deliveries.map((delivery, index) => <li key={`${delivery.created_at}-${index}`}><span><strong>{delivery.subject}</strong><small>{displayDate(delivery.created_at)} · {delivery.recipient_email}</small>{delivery.failure_reason && <small>{t('errorCode', {code: delivery.failure_reason})}</small>}</span><span className="status-pill is-closed">{statusLabel(delivery.status)}</span></li>)}</ul>}
    </section>

    {initialProfile.requests.length > 0 && <section className="member-profile-section" aria-labelledby="request-history-title">
      <p className="eyebrow">{t('history')}</p><h2 id="request-history-title">{t('requests')}</h2>
      <ul className="member-history-list">{initialProfile.requests.map((request) => <li key={request.id}><span><strong>{request.request_type === 'ownership_transfer' ? t('ownership') : t('registration')}</strong><small>{request.requested_contact_name} · {request.requested_primary_email}</small>{request.requested_other_emails?.length > 0 && <small>{t('other', {emails: request.requested_other_emails.join(', ')})}</small>}<small>{displayDate(request.created_at)}</small>{request.requested_comment && <p className="member-comment-text">{request.requested_comment}</p>}</span><span className="status-pill is-closed">{statusLabel(request.status)}</span></li>)}</ul>
    </section>}

    {initialProfile.updates.length > 0 && <section className="member-profile-section" aria-labelledby="update-history-title">
      <p className="eyebrow">{t('history')}</p><h2 id="update-history-title">{t('ownCorrections')}</h2>
      <ul className="member-history-list">{initialProfile.updates.map((update, index) => <li key={`${update.created_at}-${index}`}><span><strong>{t('contactUpdated')}</strong><small>{(update.changed_fields || []).map(changedFieldLabel).join(', ')} · {displayDate(update.created_at)}</small>{update.comment && <p className="member-comment-text">{update.comment}</p>}</span></li>)}</ul>
    </section>}

    <section className="member-profile-section member-privacy-rights" aria-labelledby="privacy-rights-title">
      <p className="eyebrow">{t('privacy')}</p><h2 id="privacy-rights-title">{t('privacyRights')}</h2>
      <p>{t('privacyHelp')} <a href="mailto:post@turufjellvel.no">post@turufjellvel.no</a>.</p>
    </section>
    {message && <p className={`member-profile-message ${isError ? 'form-error' : 'admin-success'}`} role="status">{message}</p>}
  </div>;
}
