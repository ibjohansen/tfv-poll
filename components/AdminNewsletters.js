'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import RichTextEditor from '@/components/RichTextEditor';
import RichTextContent from '@/components/RichTextContent';
import ConfirmDialog from '@/components/ConfirmDialog';
import { textToRichText } from '@/lib/rich-text';
import { useI18n } from '@/components/LocaleProvider';

const empty = () => ({ subject: '', body: textToRichText(''), group_ids: [], status: 'draft' });
export default function AdminNewsletters({ initialData, groups }) {
  const { t, formatLocale } = useI18n('email.newsletters');
  const [data, setData] = useState(initialData);
  const [campaign, setCampaign] = useState(null);
  const [preview, setPreview] = useState(null);
  const [recipient, setRecipient] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const campaignId = campaign?.id;
  const running = ['pending', 'running'].includes(campaign?.status);
  async function load(id = campaignId) {
    const response = await fetch(`/api/admin/newsletters${id ? `?id=${id}` : ''}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(t('loadError'));
    const body = await response.json(); setData(body);
    if (id) setCampaign(body.campaign);
    return body;
  }
  useEffect(() => {
    if (!running || !campaignId) return;
    const controller = new AbortController();
    let active = true;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/admin/newsletters?id=${campaignId}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        if (!response.ok) throw new Error();
        const body = await response.json();
        if (active) { setData(body); setCampaign(body.campaign); }
      } catch { if (active) setMessage(t('refreshError')); }
    }, 5000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, [campaignId, running, t]);
  function edit(values) { setCampaign((current) => ({ ...current, ...values })); setPreview(null); setDirty(true); }
  async function action(kind) {
    setBusy(true); setMessage('');
    try {
      const payload = kind === 'save' ? { action: kind, id: campaign.id, subject: campaign.subject, body: campaign.body, groupIds: campaign.group_ids }
        : { action: kind, id: campaign.id, recipient };
      const response = await fetch('/api/admin/newsletters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(kind === 'test' ? 60000 : 25000) });
      const body = await response.json();
      if (body.campaign) setCampaign(body.campaign);
      if (!response.ok) throw new Error(body.message || t('actionError'));
      if (kind === 'preview') setPreview(body);
      if (kind === 'save') { setDirty(false); await load(body.campaign.id); }
      if (kind === 'send') { setConfirm(false); await load(body.campaign.id); }
      setMessage(t(`messages.${kind}`));
    } catch (error) { setMessage(error.message || t('serverError')); }
    finally { setBusy(false); if (kind === 'send') setConfirm(false); }
  }
  const editable = campaign?.status === 'draft';
  return <div className="member-groups-layout">
    <div><Link className="admin-button" href="/admin/members/groups">{t('groups')}</Link>{' '}
      <button className="primary-button" type="button" disabled={busy || dirty} onClick={() => { setCampaign(empty()); setPreview(null); setEditorKey((key) => key + 1); setDirty(true); setMessage(''); }}>{t('new')}</button></div>
    {!data.bulkEnabled && <p role="status">{t('bulkDisabled')}</p>}
    <div className="admin-table-scroll"><table className="admin-table"><caption>{t('caption')}</caption><thead><tr><th>{t('subject')}</th><th>{t('status')}</th><th>{t('created')}</th></tr></thead><tbody>{data.campaigns.map((item) => <tr key={item.id}><td><button className="admin-button" type="button" disabled={busy || dirty} onClick={async () => {
      setBusy(true); setMessage(''); try { await load(item.id); setPreview(null); setEditorKey((key) => key + 1); } catch (error) { setMessage(error.message); } finally { setBusy(false); }
    }}>{item.subject}</button></td><td>{t(`statuses.${item.status}`, {}, item.status)}</td><td>{new Date(item.created_at).toLocaleString(formatLocale)}</td></tr>)}</tbody></table></div>
    {campaign && <section className="member-profile-section" aria-label={t('campaign')}>
      <h2>{campaign.subject || t('new')}</h2><p>{t(`statuses.${campaign.status}`, {}, campaign.status)}{dirty ? t('unsaved') : ''}</p>
      {campaign.id && <button className="admin-button" type="button" disabled={busy || dirty} onClick={() => {
        setCampaign({ subject: t('copyTitle', { title: campaign.subject }).slice(0, 160), body: structuredClone(campaign.body), group_ids: campaign.group_ids.filter((id) => groups.some((group) => String(group.id) === String(id))), status: 'draft' });
        setPreview(null); setEditorKey((key) => key + 1); setDirty(true); setMessage(t('copied'));
      }}>{t('copy')}</button>}
      {editable ? <form className="admin-detail-form" onSubmit={(event) => { event.preventDefault(); action('save'); }}>
        <label>{t('subject')}<input value={campaign.subject} onChange={(event) => edit({ subject: event.target.value })} maxLength={160} required disabled={busy} /></label>
        <RichTextEditor key={editorKey} value={campaign.body} onChange={(body) => edit({ body })} disabled={busy} />
        <fieldset disabled={busy}><legend>{t('recipientGroups')}</legend>{groups.length ? groups.map((group) => <label key={group.id} className="admin-checkbox"><input type="checkbox" checked={campaign.group_ids.map(String).includes(String(group.id))} onChange={(event) => edit({ group_ids: event.target.checked ? [...campaign.group_ids, String(group.id)] : campaign.group_ids.filter((id) => String(id) !== String(group.id)) })} />{group.name} ({t('addresses', {count: group.email_count})})</label>) : <p>{t('createGroup')}</p>}</fieldset>
        <button className="primary-button" disabled={busy || !campaign.group_ids.length}>{t('saveDraft')}</button>
        <button className="admin-button" type="button" disabled={busy} onClick={() => { setCampaign(null); setPreview(null); setDirty(false); }}>{t('discard')}</button>
      </form> : <div className="cms-article-body"><RichTextContent value={campaign.body} /></div>}
      <p>{t('locking')}</p>
      {campaign.id && <>
        <button type="button" className="admin-button" disabled={busy || dirty} onClick={() => action('preview')}>{t('preview')}</button>
        {preview && <section aria-label={t('previewRegion')}><h3>{preview.campaign.subject}</h3><p>{t('uniqueRecipients', {count: preview.recipientCount})}</p><div className="cms-article-body"><RichTextContent value={preview.campaign.body} /></div></section>}
        <form className="admin-detail-form" onSubmit={(event) => { event.preventDefault(); action('test'); }}><label>{t('testRecipient')}<input type="email" value={recipient} onChange={(event) => setRecipient(event.target.value)} maxLength={254} required disabled={busy} /></label><button className="admin-button" disabled={busy || dirty}>{t('sendTest')}</button></form>
        {campaign.status !== 'completed' && <button type="button" className="primary-button" disabled={busy || dirty || !data.bulkEnabled || (editable && !preview?.recipientCount)} onClick={() => setConfirm(true)}>{editable ? t('start') : t('resume')}</button>}
        {!editable && <p role="status">{t('counts', {total: campaign.total_count || 0, sent: campaign.sent_count || 0, delivered: campaign.delivered_count || 0, failed: campaign.failed_count || 0, suppressed: campaign.suppressed_count || 0, pending: campaign.pending_count || 0})}</p>}
        {campaign.error_message && <p role="alert">{campaign.error_message}</p>}
        {data.deliveries.length > 0 && <details><summary>{t('history')}</summary><ul>{data.deliveries.map((delivery) => <li key={delivery.id}>{delivery.recipient_domain} · {delivery.email_type === 'newsletter_test' ? t('testEmail') : t('newsletter')} · {delivery.status}{delivery.failure_reason ? ` · ${delivery.failure_reason}` : ''}</li>)}</ul></details>}
      </>}
    </section>}
    {message && <p role="status">{message}</p>}
    <ConfirmDialog open={confirm} destructive={false} eyebrow={t('confirmEyebrow')} title={t('confirmTitle')} description={t('confirmDescription')} confirmLabel={t('confirm')} busy={busy} onCancel={() => setConfirm(false)} onConfirm={() => action('send')} />
  </div>;
}
