'use client';

import { useCallback, useEffect, useState } from 'react';
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

  const load = useCallback(async (signal) => {
    try {
      const query = new URLSearchParams({ page: String(page) });
      if (groupId) query.set('groupId', groupId);
      const response = await fetch(`/api/admin/surveys/${surveyId}/email?${query}`, { signal });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || t('loadError'));
      setOverview(body.overview);
      if (!groupId && body.overview.selected_group_id) setGroupId(String(body.overview.selected_group_id));
      setState('ready');
    } catch (error) {
      if (error.name !== 'AbortError') { setMessage(error.message); setMessageKind('error'); setState('error'); }
    }
  }, [groupId, page, surveyId, t]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => load(controller.signal), 0);
    return () => { clearTimeout(timer); controller.abort(); };
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
      setMessage(action === 'test' ? t(body.delivery.recipientCount === 1 ? 'testsAcceptedOne' : 'testsAcceptedMany', {count: body.delivery.recipientCount}) : body.backgroundStarted ? t('started') : t('backgroundFailed'));
      setMessageKind(body.backgroundStarted === false ? 'error' : 'success');
      await load();
    } catch (error) { setMessage(error.message); setMessageKind('error'); }
    finally { setBusy(''); setConfirmSend(false); }
  }

  if (state === 'loading') return <p role="status">{t('loading')}</p>;
  if (!overview) return <p className="form-error" role="alert">{message || t('loadError')}</p>;
  const campaign = overview.campaign;
  const groups = overview.groups || [];
  const previewRecipients = overview.recipients || [];
  const progress = campaign?.total_count ? Math.round(((campaign.sent_count + campaign.failed_count + campaign.suppressed_count) / campaign.total_count) * 100) : 0;
  const canStart = overview.configured && overview.bulk_enabled && overview.survey?.can_send && !campaign && groupId && overview.recipient_count > 0;
  const canResume = overview.configured && overview.bulk_enabled && overview.survey?.can_send && ['pending', 'failed'].includes(campaign?.status);
  const canReplace = overview.configured && overview.bulk_enabled && overview.survey?.can_send && campaign?.status === 'completed' && groupId && overview.recipient_count > 0;
  const groupSelectionLocked = Boolean(campaign && campaign.status !== 'completed');

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
      {!overview.bulk_enabled && <p className="survey-email-warning" role="status">{t('bulkDisabled')}</p>}
      <label className="survey-email-group">{t('recipientGroup')}
        <select value={groupId} disabled={Boolean(busy) || groupSelectionLocked} onChange={(event) => {
          const nextGroupId = event.target.value;
          setGroupId(nextGroupId); setPage(1); setState('loading'); setMessage(''); setMessageKind('');
          setOverview((current) => current ? { ...current, selected_group_id: nextGroupId || null,
            recipients: [], recipient_count: 0, missing_email_count: 0 } : current);
        }}>
          <option value="">{t('chooseGroup')}</option>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name} ({t('groupRecipients', {count: group.recipient_count})})</option>)}
        </select>
      </label>
      <p>{groupSelectionLocked ? t('lockedGroup', {name: campaign.group_name || t('unknownGroup')}) : t('groupHelp')}</p>
      {!groups.length && <p className="survey-email-warning" role="status">{t('noGroups')}</p>}
      {campaign ? <>
        <div className="survey-email-campaign-heading"><span className={`status-pill is-${campaign.status === 'completed' ? 'open' : 'closed'}`}>{t(`statuses.${campaign.status}`, {}, campaign.status)}</span><span>{t('processed', {count: progress})}</span></div>
        <div className="progress-track" aria-label={t('progress', {count: progress})}><span className="progress-value" style={{ width: `${progress}%` }} /></div>
        <dl className="survey-email-stats"><div><dt>{t('accepted')}</dt><dd>{campaign.sent_count}</dd></div><div><dt>{t('delivered')}</dt><dd>{campaign.delivered_count}</dd></div><div><dt>{t('failed')}</dt><dd>{campaign.failed_count}</dd></div><div><dt>{t('suppressed')}</dt><dd>{campaign.suppressed_count}</dd></div></dl>
        {campaign.error_message && <p className="form-error" role="alert">{t('jobStopped', {message: campaign.error_message})}</p>}
        {canResume && <button className="admin-button" type="button" disabled={busy} onClick={() => setConfirmSend(true)}>{t('restart')}</button>}
        {canReplace && <button className="admin-button" type="button" disabled={busy} onClick={() => setConfirmSend(true)}>{t('sendNewLinks')}</button>}
      </> : <>
        <p>{t(overview.recipient_count === 1 ? 'oneWillReceive' : 'manyWillReceive', {count: overview.recipient_count})}</p>
        <button className="primary-button" type="button" disabled={!canStart || busy} onClick={() => setConfirmSend(true)}>{overview.bulk_enabled ? t('start') : t('bulkDisabled')}</button>
      </>}
    </section>

    {groupId && <section className="survey-email-recipients" aria-labelledby="survey-email-recipients-heading">
      <h4 id="survey-email-recipients-heading">{t('recipientList')}</h4>
      {previewRecipients.length ? <div className="admin-table-scroll"><table className="admin-table">
        <caption>{t('recipientCaption')}</caption><thead><tr><th scope="col">{t('name')}</th><th scope="col">{t('titleHolder')}</th><th scope="col">{t('primaryEmail')}</th></tr></thead>
        <tbody>{previewRecipients.map((recipient) => <tr key={recipient.id}><th scope="row">{recipient.name || '—'}</th><td>{recipient.title_holder || '—'}</td><td>{recipient.primary_contact_email}</td></tr>)}</tbody>
      </table></div> : <p>{t('noRecipients')}</p>}
    </section>}

    {campaign && <section className="survey-email-deliveries"><h4>{t('deliveryStatus')}</h4>
      <div className="admin-table-scroll"><table className="admin-table"><caption>{t('deliveryCaption')}</caption><thead><tr><th scope="col">{t('member')}</th><th scope="col">{t('domain')}</th><th scope="col">{t('status')}</th><th scope="col">{t('note')}</th></tr></thead><tbody>{overview.deliveries.map((delivery) => <tr key={delivery.id}><th scope="row">{delivery.h_number || t('unknown')}</th><td>{delivery.recipient_domain}</td><td>{t(`statuses.${delivery.status}`, {}, delivery.status)}</td><td>{delivery.failure_reason || '—'}</td></tr>)}</tbody></table></div>
      {overview.pages > 1 && <nav className="survey-email-pages" aria-label={t('deliveryPages')}><button className="admin-button" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t('previous')}</button><span>{t('page', {page: overview.page, pages: overview.pages})}</span><button className="admin-button" type="button" disabled={page >= overview.pages} onClick={() => setPage((value) => value + 1)}>{t('next')}</button></nav>}
    </section>}
    {message && <p className={messageKind === 'success' ? 'admin-success' : 'form-error'} role="status">{message}</p>}
    <ConfirmDialog open={confirmSend} eyebrow={t('confirmEyebrow')} destructive={false} title={t('confirmTitle', {count: overview.recipient_count})} description={canReplace ? t('replaceDescription') : t('sendDescription')} confirmLabel={t('start')} busy={busy === 'send' || busy === 'resend'} onCancel={() => setConfirmSend(false)} onConfirm={() => post(canReplace ? 'resend' : 'send', { groupId })} />
  </section>;
}
