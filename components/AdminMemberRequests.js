'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useI18n } from '@/components/LocaleProvider';

function requestTitle(request, t) {
  if (request.request_type === 'profile_update') return t('correctionTitle', {id: request.h_number});
  return t(request.request_type === 'ownership_transfer' ? 'ownershipTitle' : 'membershipTitle', {id: request.h_number || request.street_address});
}

function decisionDescription(decision, t) {
  if (!decision) return '';
  const warning = decision.request.status === 'pending_verification'
    ? t('unverifiedWarning')
    : '';
  if (decision.action === 'reject') return `${warning}${t('rejectDescription')}`;
  if (decision.request.request_type === 'ownership_transfer') return `${warning}${t('ownershipDescription')}`;
  return `${warning}${t('membershipDescription')}`;
}

function reviewMessage(review, t) {
  if (!review) return t('notChecked');
  return t(`reviewCodes.${review.code}`, {}, review.message || t('manualRequired'));
}

export default function AdminMemberRequests({ initialRequests, showEmpty = false }) {
  const { t } = useI18n('members.requests');
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [decision, setDecision] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState('');
  const [propertyDrafts, setPropertyDrafts] = useState(() => Object.fromEntries(initialRequests.map((request) => [request.id, {
    cadastral_number: request.cadastral_number || '', section_number: request.section_number || '',
  }])));
  if (!requests.length && !message && !showEmpty) return null;

  async function resolve() {
    setBusy(true); setMessage(''); setMessageKind('');
    try {
      const response = await fetch(`/api/admin/member-requests/${decision.request.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: decision.action }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || t('requestError'));
      setRequests((current) => current.filter((request) => request.id !== decision.request.id));
      setMessage(decision.action === 'approve' ? t('approved') : t('rejected'));
      setMessageKind('success');
      setDecision(null); router.refresh();
    } catch (error) { setMessage(error.message); setMessageKind('error'); setDecision(null); }
    finally { setBusy(false); }
  }

  async function acknowledge(request) {
    setBusy(true); setMessage(''); setMessageKind('');
    try {
      const response = await fetch(`/api/admin/member-requests/${request.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'acknowledge_comment' }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || t('acknowledgeError'));
      setRequests((current) => current.filter((item) => item.id !== request.id));
      setMessage(t('acknowledged')); setMessageKind('success'); router.refresh();
    } catch (error) { setMessage(error.message); setMessageKind('error'); }
    finally { setBusy(false); }
  }

  async function updateProperty(request, action) {
    const draft = propertyDrafts[request.id] || {};
    setBusy(true); setMessage(''); setMessageKind('');
    try {
      const response = await fetch(`/api/admin/member-requests/${request.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...draft }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || t('cadastralError'));
      setRequests((current) => current.map((item) => item.id === request.id ? { ...item, ...body.request } : item));
      setMessage(action === 'check_property' && body.request.matrikkel_review?.status === 'verified'
        ? t('verified')
        : action === 'confirm_property' ? t('confirmed')
          : reviewMessage(body.request.matrikkel_review, t));
      setMessageKind('success');
    } catch (error) { setMessage(error.message); setMessageKind('error'); }
    finally { setBusy(false); }
  }

  function setPropertyDraft(requestId, changes) {
    setPropertyDrafts((current) => ({ ...current, [requestId]: { ...current[requestId], ...changes } }));
  }

  return <section className="admin-member-requests" aria-labelledby="member-requests-title">
    <div className="admin-section-header"><div><p className="eyebrow">{t('eyebrow')}</p><h2 id="member-requests-title">{t('title')}</h2></div><span>{requests.length}</span></div>
    {!requests.length && <p className="admin-inbox-empty">{t('empty')}</p>}
    {requests.length > 0 && <div className="admin-member-request-list">{requests.map((request) => <article key={request.id}>
      {request.requested_comment && <section aria-label={t('memberComment')}><strong>{t('containsComment')}</strong><p className="member-comment-text">{request.requested_comment}</p></section>}
      <div className="admin-member-request-summary"><h3>{requestTitle(request, t)}</h3><p>{request.street_address || t('addressMissing')} · {request.title_holder || t('ownerMissing')}</p><span className={`admin-request-verification ${request.status === 'pending_verification' ? 'is-unverified' : 'is-verified'}`}>{request.status === 'pending_verification' ? t('unverified') : t('emailVerified')}</span></div>
      <dl><div><dt>{t('cadastral')}</dt><dd>{request.cadastral_number || t('notProvided')}</dd></div><div><dt>{t('section')}</dt><dd>{request.section_number || t('notProvided')}</dd></div><div><dt>{t('newContact')}</dt><dd>{request.requested_contact_name}</dd></div><div><dt>{t('newEmail')}</dt><dd>{request.requested_primary_email}</dd></div><div><dt>{t('otherAddresses')}</dt><dd>{request.requested_other_emails?.join(', ') || t('none')}</dd></div></dl>
      {request.request_type === 'membership' && <section className={`admin-property-review is-${request.matrikkel_review?.status || 'pending'}`} aria-label={t('cadastralReview')}>
        <strong>{['verified', 'manual'].includes(request.matrikkel_review?.status) ? t('cadastralResolved') : t('cadastralRequired')}</strong>
        <p>{reviewMessage(request.matrikkel_review, t)}</p>
        {request.matrikkel_review?.candidates?.length > 0 && <ul>{request.matrikkel_review.candidates.map((candidate) => <li key={`${candidate.gnr}/${candidate.bnr}/${candidate.snr}`}><button type="button" onClick={() => setPropertyDraft(request.id, { cadastral_number: `${candidate.gnr}/${candidate.bnr}`, section_number: candidate.snr === '0' ? '' : candidate.snr })}>{candidate.address}: {candidate.gnr}/{candidate.bnr}{candidate.snr !== '0' ? t('candidateSection', {number: candidate.snr}) : ''}</button></li>)}</ul>}
        <div className="admin-property-fields">
          <label>{t('cadastralNumber')}<input value={propertyDrafts[request.id]?.cadastral_number || ''} onChange={(event) => setPropertyDraft(request.id, { cadastral_number: event.target.value })} placeholder="10/770" /></label>
          <label>{t('sectionNumber')}<input value={propertyDrafts[request.id]?.section_number || ''} onChange={(event) => setPropertyDraft(request.id, { section_number: event.target.value })} inputMode="numeric" placeholder={t('optional')} /></label>
        </div>
        <div className="admin-property-actions"><button className="admin-button" type="button" disabled={busy} onClick={() => updateProperty(request, 'check_property')}>{t('check')}</button><button className="admin-button" type="button" disabled={busy} onClick={() => updateProperty(request, 'confirm_property')}>{t('confirmManually')}</button></div>
      </section>}
      {request.request_type === 'profile_update' ? <div className="admin-member-request-actions"><p>{t('alreadyUpdated')}</p><button className="admin-button" type="button" disabled={busy} onClick={() => acknowledge(request)}>{t('acknowledge')}</button></div>
        : <div className="admin-member-request-actions"><button className="admin-button" type="button" disabled={busy} onClick={() => setDecision({ request, action: 'reject' })}>{t('reject')}</button><button className="primary-button" type="button" disabled={busy || (request.request_type === 'membership' && !['verified', 'manual'].includes(request.matrikkel_review?.status))} onClick={() => setDecision({ request, action: 'approve' })}>{t('approve')}</button></div>}
    </article>)}</div>}
    {message && <p className={messageKind === 'success' ? 'admin-success' : 'form-error'} role="status">{message}</p>}
    <ConfirmDialog open={Boolean(decision)} eyebrow={decision?.request.status === 'pending_verification' ? t('unverifiedRequest') : t('confirmTreatment')} destructive={decision?.action === 'reject'} title={decision ? t(decision.action === 'approve' ? 'approveTitle' : 'rejectTitle', {title: requestTitle(decision.request, t)}) : ''} description={decisionDescription(decision, t)} confirmLabel={decision?.action === 'approve' && decision?.request.status === 'pending_verification' ? t('approveAnyway') : decision?.action === 'approve' ? t('approve') : t('reject')} busy={busy} onCancel={() => setDecision(null)} onConfirm={resolve} />
  </section>;
}
