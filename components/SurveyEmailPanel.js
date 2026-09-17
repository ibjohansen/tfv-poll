'use client';

import Select from "@/components/Select";
import SurveyRecipientPicker from '@/components/SurveyRecipientPicker';
import { useCallback, useEffect, useRef, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useI18n } from '@/components/LocaleProvider';

export default function SurveyEmailPanel({ surveyId, adminEmail }) {
  const { t } = useI18n('surveys.email');
  const [overview, setOverview] = useState(null);
  const [state, setState] = useState('loading');
  const [page, setPage] = useState(1);
  const [groupId, setGroupId] = useState('');
  const [recipients, setRecipients] = useState(adminEmail || '');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState('');
  const [confirmSend, setConfirmSend] = useState(false);
  const [sendAction, setSendAction] = useState('send');
  const [includeOtherEmails, setIncludeOtherEmails] = useState(false);
  const [singleResponsePerProperty, setSingleResponsePerProperty] = useState(true);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const memberIds = selectedMembers.map((member) => String(member.id)).join(',');
  const requestVersion = useRef(0);

  const load = useCallback(async (signal) => {
    const version = ++requestVersion.current;
    try {
      const query = new URLSearchParams({ page: String(page) });
      query.set('groupId', groupId);
      query.set('includeOtherEmails', String(includeOtherEmails));
      if (memberIds) query.set('memberIds', memberIds);
      const response = await fetch(`/api/admin/surveys/${surveyId}/email?${query}`, { signal });
      const body = await response.json();
      if (signal?.aborted || version !== requestVersion.current) return;
      if (!response.ok || !body.ok) throw new Error(body.message || t('loadError'));
      setOverview(body.overview);
      if (body.overview.campaign || body.overview.survey?.policy_locked) setSingleResponsePerProperty(body.overview.survey?.single_response_per_property !== false);
      setState('ready');
    } catch (error) {
      if (error.name !== 'AbortError' && version === requestVersion.current) { setMessage(error.message); setMessageKind('error'); setState('error'); }
    }
  }, [groupId, page, surveyId, t, includeOtherEmails, memberIds]);

  useEffect(() => {
    const controller = new AbortController();
    const requests = requestVersion;
    const timer = setTimeout(() => load(controller.signal), 0);
    return () => { clearTimeout(timer); controller.abort(); requests.current++; };
  }, [load]);

  useEffect(() => {
    if (!['pending', 'running'].includes(overview?.campaign?.status)) return undefined;
    const timer = setInterval(() => load(), 5000);
    return () => clearInterval(timer);
  }, [load, overview?.campaign?.status]);

  async function post(action, extra = {}) {
    setBusy(action);
    setMessage(''); setMessageKind('');
    try {
      const response = await fetch(`/api/admin/surveys/${surveyId}/email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }),
      });
      const body = await response.json();
      if (body.campaign) setOverview((current) => current ? { ...current, campaign: body.campaign } : current);
      if (!response.ok || !body.ok) throw new Error(body.message || t('actionError'));
      const nothingAdded = action === 'append' && body.added_count === 0;
      setMessage(action === 'test' ? t(body.delivery.recipientCount === 1 ? 'testsAcceptedOne' : 'testsAcceptedMany', {count: body.delivery.recipientCount}) : nothingAdded ? t('noNewRecipients') : body.backgroundStarted ? t('started') : t('backgroundFailed'));
      setMessageKind(body.backgroundStarted === false && !nothingAdded ? 'error' : 'success');
      await load();
    } catch (error) { setMessage(error.message); setMessageKind('error'); }
    finally { setBusy(''); setConfirmSend(false); }
  }

  if (state === 'loading' && !overview) return <p role="status">{t('loading')}</p>;
  if (!overview) return <p className="form-error" role="alert">{message || t('loadError')}</p>;
  const campaign = overview.campaign;
  const groups = overview.groups || [];
  const previewRecipients = overview.recipients || [];
  const progress = campaign?.total_count ? Math.round(((campaign.sent_count + campaign.failed_count + campaign.suppressed_count) / campaign.total_count) * 100) : 0;
  const canSelect = overview.configured && overview.background_configured && overview.bulk_enabled && overview.survey?.can_send && (groupId || selectedMembers.length) && overview.recipient_count > 0 && state !== 'loading';
  const canStart = canSelect && !campaign;
  const canResume = overview.configured && overview.background_configured && overview.bulk_enabled && overview.survey?.can_send && ['pending', 'failed'].includes(campaign?.status);
  const canReplace = canSelect && campaign?.status === 'completed';
  const groupSelectionLocked = false;
  const backgroundMessage = t(overview.background_status === 'job_secret_missing' ? 'backgroundSecretMissing' : 'backgroundUnavailable');
  const blockedReason = !overview.configured ? t('disabled')
    : !overview.bulk_enabled ? t('bulkDisabled')
      : !overview.background_configured ? backgroundMessage
        : !overview.survey?.can_send ? t('surveyUnavailable')
          : !groupSelectionLocked && !groupId && !selectedMembers.length ? t('chooseGroupOrProperties')
            : !groupSelectionLocked && !overview.recipient_count ? t('noRecipients') : '';

  return <section className="survey-email" aria-labelledby="survey-email-heading">
    <div className="survey-results-summary"><div><p className="eyebrow">{t('eyebrow')}</p><h3 id="survey-email-heading">{t('title')}</h3><p>{t('privacy')}</p></div></div>
    {!overview.configured && <p className="survey-email-warning" role="alert">{t('disabled')}</p>}
    <div className="survey-email-counts" aria-label={t('recipientOverview')}>
      <div><strong>{overview.recipient_count}</strong><span>{t('recipients')}</span></div>
      <div><strong>{overview.missing_email_count}</strong><span>{t('missingEmails')}</span></div>
    </div>

    <section className="survey-email-card">
      <h4>{t('testTitle')}</h4>
      <p>{t('testHelp')}</p>
      <label>{t('testRecipients')}<input type="email" multiple value={recipients} onChange={(event) => setRecipients(event.target.value)} placeholder={t('testPlaceholder')} required /></label>
      <button className="admin-button" type="button" disabled={!overview.configured || busy} onClick={() => post('test', { recipient: recipients })}>{busy === 'test' ? t('sending') : t('sendTest')}</button>
    </section>

    <section className="survey-email-card">
      <h4>{t('bulkTitle')}</h4>
      {blockedReason && <p id="survey-email-blocked-reason" className="survey-email-warning" role="status">{blockedReason}</p>}
      <label className="survey-email-group">{t('recipientGroup')}
        <Select value={groupId} disabled={Boolean(busy) || groupSelectionLocked} onChange={(event) => {
          const nextGroupId = event.target.value;
          setGroupId(nextGroupId); setPage(1); setState('loading'); setMessage(''); setMessageKind('');
          setOverview((current) => current ? { ...current, selected_group_id: nextGroupId || null,
            recipients: [], recipient_count: 0, missing_email_count: 0 } : current);
        }}>
          <option value="">{t('chooseGroup')}</option>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name} ({t('groupRecipients', {count: group.recipient_count})})</option>)}
        </Select>
      </label>
      <SurveyRecipientPicker surveyId={surveyId} selected={selectedMembers} onChange={(members) => { setSelectedMembers(members); setState('loading'); }} disabled={Boolean(busy)} />
      <label className="admin-checkbox"><input type="checkbox" checked={includeOtherEmails} disabled={Boolean(busy)} onChange={(event) => { setIncludeOtherEmails(event.target.checked); setState('loading'); }} />{t('includeOtherEmails')}</label>
      <label className="admin-checkbox"><input type="checkbox" checked={singleResponsePerProperty} disabled={Boolean(busy) || Boolean(campaign) || overview.survey?.policy_locked} onChange={(event) => setSingleResponsePerProperty(event.target.checked)} />{t('singleResponse')}</label>
      <p>{singleResponsePerProperty ? t('singleResponseHelp') : t('independentResponseHelp')}</p>
      {campaign && <p>{t('policyLocked')}</p>}
      <p>{groupSelectionLocked ? t('lockedGroup', {name: campaign.group_name || t('unknownGroup')}) : t('groupHelp')}</p>
      {!groups.length && <p className="survey-email-warning" role="status">{t('noGroups')}</p>}
      {campaign ? <>
        <div className="survey-email-campaign-heading"><span className={`status-pill is-${campaign.status === 'completed' ? 'open' : 'closed'}`}>{t(`statuses.${campaign.status}`, {}, campaign.status)}</span><span>{t('processed', {count: progress})}</span></div>
        <div className="progress-track" aria-label={t('progress', {count: progress})}><span className="progress-value" style={{ width: `${progress}%` }} /></div>
        <dl className="survey-email-stats"><div><dt>{t('accepted')}</dt><dd>{campaign.sent_count}</dd></div><div><dt>{t('delivered')}</dt><dd>{campaign.delivered_count}</dd></div><div><dt>{t('failed')}</dt><dd>{campaign.failed_count}</dd></div><div><dt>{t('suppressed')}</dt><dd>{campaign.suppressed_count}</dd></div></dl>
        {campaign.error_message && <p className="form-error" role="alert">{t('jobStopped', {message: campaign.error_message})}</p>}
        {['pending', 'failed'].includes(campaign.status) && <button className="admin-button" type="button" disabled={!canResume || Boolean(busy)} aria-describedby={blockedReason ? 'survey-email-blocked-reason' : undefined} onClick={() => { setSendAction('send'); setConfirmSend(true); }}>{t('restart')}</button>}
        <button className="primary-button" type="button" disabled={!canSelect || Boolean(busy)} onClick={() => { setSendAction('append'); setConfirmSend(true); }}>{t('addRecipients')}</button>
        {campaign.status === 'completed' && <button className="admin-button" type="button" disabled={!canReplace || Boolean(busy)} aria-describedby={blockedReason ? 'survey-email-blocked-reason' : undefined} onClick={() => { setSendAction('resend'); setConfirmSend(true); }}>{t('sendNewLinks')}</button>}
      </> : <>
        <p>{t(overview.recipient_count === 1 ? 'oneWillReceive' : 'manyWillReceive', {count: overview.recipient_count})}</p>
        <button className="primary-button" type="button" disabled={!canStart || Boolean(busy)} aria-describedby={blockedReason ? 'survey-email-blocked-reason' : undefined} onClick={() => { setSendAction('send'); setConfirmSend(true); }}>{t('start')}</button>
      </>}
    </section>

    {(groupId || selectedMembers.length > 0) && <section className="survey-email-recipients" aria-labelledby="survey-email-recipients-heading">
      <h4 id="survey-email-recipients-heading">{t('recipientList')}</h4>
      {previewRecipients.length ? <div className="admin-table-scroll"><table className="admin-table">
        <caption>{t('recipientCaption')}</caption><thead><tr><th scope="col">{t('name')}</th><th scope="col">{t('titleHolder')}</th><th scope="col">{t('primaryEmail')}</th><th scope="col">{t('recipientEmail')}</th></tr></thead>
        <tbody>{previewRecipients.map((recipient) => <tr key={`${recipient.id}:${recipient.email || recipient.primary_contact_email}`}><th scope="row">{recipient.name || '—'}</th><td>{recipient.title_holder || '—'}</td><td>{recipient.primary_contact_email || '—'}</td><td>{recipient.email || recipient.primary_contact_email}{recipient.is_primary === false && <small> · {t('additionalEmail')}</small>}</td></tr>)}</tbody>
      </table></div> : <p>{t('noRecipients')}</p>}
    </section>}

    {campaign && <section className="survey-email-deliveries"><h4>{t('deliveryStatus')}</h4>
      <div className="admin-table-scroll"><table className="admin-table"><caption>{t('deliveryCaption')}</caption><thead><tr><th scope="col">{t('member')}</th><th scope="col">{t('domain')}</th><th scope="col">{t('status')}</th><th scope="col">{t('note')}</th></tr></thead><tbody>{overview.deliveries.map((delivery) => <tr key={delivery.id}><th scope="row">{delivery.h_number || t('unknown')}</th><td>{delivery.recipient_domain}</td><td>{t(`statuses.${delivery.status}`, {}, delivery.status)}</td><td>{delivery.failure_reason || '—'}</td></tr>)}</tbody></table></div>
      {overview.pages > 1 && <nav className="survey-email-pages" aria-label={t('deliveryPages')}><button className="admin-button" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t('previous')}</button><span>{t('page', {page: overview.page, pages: overview.pages})}</span><button className="admin-button" type="button" disabled={page >= overview.pages} onClick={() => setPage((value) => value + 1)}>{t('next')}</button></nav>}
    </section>}
    {message && <p className={messageKind === 'success' ? 'admin-success' : 'form-error'} role="status">{message}</p>}
    {overview.receipts && <section className="survey-email-card"><h4>{t('receipts')}</h4><p>{t('receiptCounts', overview.receipts)}</p></section>}
    <ConfirmDialog open={confirmSend} eyebrow={t('confirmEyebrow')} destructive={false} title={t('confirmTitle', {count: sendAction === 'send' && campaign ? campaign.total_count : overview.recipient_count})} description={t(sendAction === 'resend' ? 'replaceDescription' : sendAction === 'append' ? 'appendDescription' : 'sendDescription')} confirmLabel={t('start')} busy={Boolean(busy)} onCancel={() => setConfirmSend(false)} onConfirm={() => post(sendAction, { groupId, memberIds: selectedMembers.map((member) => String(member.id)), includeOtherEmails, singleResponsePerProperty })} />
  </section>;
}
