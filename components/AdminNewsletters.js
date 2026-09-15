'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import RichTextEditor from '@/components/RichTextEditor';
import RichTextContent from '@/components/RichTextContent';
import ConfirmDialog from '@/components/ConfirmDialog';
import { textToRichText } from '@/lib/rich-text';

const empty = () => ({ subject: '', body: textToRichText(''), group_ids: [], status: 'draft' });
const labels = { draft: 'Utkast', pending: 'Venter', running: 'Sender', completed: 'Fullført', failed: 'Avbrutt / feil' };
export default function AdminNewsletters({ initialData, groups }) {
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
    if (!response.ok) throw new Error('Kunne ikke hente status.');
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
      } catch { if (active) setMessage('Status kunne ikke oppdateres. Utsendingen kan fortsatt pågå.'); }
    }, 5000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, [campaignId, running]);
  function edit(values) { setCampaign((current) => ({ ...current, ...values })); setPreview(null); setDirty(true); }
  async function action(kind) {
    setBusy(true); setMessage('');
    try {
      const payload = kind === 'save' ? { action: kind, id: campaign.id, subject: campaign.subject, body: campaign.body, groupIds: campaign.group_ids }
        : { action: kind, id: campaign.id, recipient };
      const response = await fetch('/api/admin/newsletters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(kind === 'test' ? 60000 : 25000) });
      const body = await response.json();
      if (body.campaign) setCampaign(body.campaign);
      if (!response.ok) throw new Error(body.message || 'Handlingen kunne ikke utføres.');
      if (kind === 'preview') setPreview(body);
      if (kind === 'save') { setDirty(false); await load(body.campaign.id); }
      if (kind === 'send') { setConfirm(false); await load(body.campaign.id); }
      setMessage(({ save: 'Utkastet er lagret.', preview: 'Forhåndsvisningen er oppdatert.', test: 'Testmailen er sendt.', send: 'Bakgrunnsjobben er bestilt. Kontroller fremdriften nedenfor.' })[kind]);
    } catch (error) { setMessage(error.message || 'Kunne ikke kontakte serveren.'); }
    finally { setBusy(false); if (kind === 'send') setConfirm(false); }
  }
  const editable = campaign?.status === 'draft';
  return <div className="member-groups-layout">
    <div><Link className="admin-button" href="/admin/members/groups">Administrer e-postgrupper</Link>{' '}
      <button className="primary-button" type="button" disabled={busy || dirty} onClick={() => { setCampaign(empty()); setPreview(null); setEditorKey((key) => key + 1); setDirty(true); setMessage(''); }}>Nytt nyhetsbrev</button></div>
    {!data.bulkEnabled && <p role="status">Masseutsending er deaktivert i konfigurasjonen. Utkast og forhåndsvisning kan fortsatt brukes.</p>}
    <div className="admin-table-scroll"><table className="admin-table"><caption>De siste 100 nyhetsbrevene</caption><thead><tr><th>Emne</th><th>Status</th><th>Opprettet</th></tr></thead><tbody>{data.campaigns.map((item) => <tr key={item.id}><td><button className="admin-button" type="button" disabled={busy || dirty} onClick={async () => {
      setBusy(true); setMessage(''); try { await load(item.id); setPreview(null); setEditorKey((key) => key + 1); } catch (error) { setMessage(error.message); } finally { setBusy(false); }
    }}>{item.subject}</button></td><td>{labels[item.status]}</td><td>{new Date(item.created_at).toLocaleString('nb-NO')}</td></tr>)}</tbody></table></div>
    {campaign && <section className="member-profile-section" aria-label="Nyhetsbrevkampanje">
      <h2>{campaign.subject || 'Nytt nyhetsbrev'}</h2><p>{labels[campaign.status]}{dirty ? ' · Ikke lagrede endringer' : ''}</p>
      {editable ? <form className="admin-detail-form" onSubmit={(event) => { event.preventDefault(); action('save'); }}>
        <label>Emne<input value={campaign.subject} onChange={(event) => edit({ subject: event.target.value })} maxLength={160} required disabled={busy} /></label>
        <RichTextEditor key={editorKey} value={campaign.body} onChange={(body) => edit({ body })} disabled={busy} />
        <fieldset disabled={busy}><legend>Mottakergrupper</legend>{groups.length ? groups.map((group) => <label key={group.id} className="admin-checkbox"><input type="checkbox" checked={campaign.group_ids.map(String).includes(String(group.id))} onChange={(event) => edit({ group_ids: event.target.checked ? [...campaign.group_ids, String(group.id)] : campaign.group_ids.filter((id) => String(id) !== String(group.id)) })} />{group.name} ({group.email_count} adresser)</label>) : <p>Opprett en e-postgruppe først.</p>}</fieldset>
        <button className="primary-button" disabled={busy || !campaign.group_ids.length}>Lagre utkast</button>
        <button className="admin-button" type="button" disabled={busy} onClick={() => { setCampaign(null); setPreview(null); setDirty(false); }}>Forkast ikke lagrede endringer</button>
      </form> : <div className="cms-article-body"><RichTextContent value={campaign.body} /></div>}
      <p>Innhold og mottakergrunnlag låses ved oppstart. Hver normaliserte adresse får høyst én levering i kampanjen. Ingen åpnings- eller klikksporing.</p>
      {campaign.id && <>
        <button type="button" className="admin-button" disabled={busy || dirty} onClick={() => action('preview')}>Forhåndsvis og tell mottakere</button>
        {preview && <section aria-label="Forhåndsvisning"><h3>{preview.campaign.subject}</h3><p>{preview.recipientCount} unike adresser i gjeldende utvalg, før leveringsreservasjoner.</p><div className="cms-article-body"><RichTextContent value={preview.campaign.body} /></div></section>}
        <form className="admin-detail-form" onSubmit={(event) => { event.preventDefault(); action('test'); }}><label>Testmottaker<input type="email" value={recipient} onChange={(event) => setRecipient(event.target.value)} maxLength={254} required disabled={busy} /></label><button className="admin-button" disabled={busy || dirty}>Send testmail</button></form>
        {campaign.status !== 'completed' && <button type="button" className="primary-button" disabled={busy || dirty || !data.bulkEnabled || (editable && !preview?.recipientCount)} onClick={() => setConfirm(true)}>{editable ? 'Start utsending' : 'Kontroller / gjenoppta jobb'}</button>}
        {!editable && <p role="status">Totalt {campaign.total_count || 0} · Sendt {campaign.sent_count || 0} · Levert {campaign.delivered_count || 0} · Feilet {campaign.failed_count || 0} · Undertrykt {campaign.suppressed_count || 0} · Venter {campaign.pending_count || 0}</p>}
        {campaign.error_message && <p role="alert">{campaign.error_message}</p>}
        {data.deliveries.length > 0 && <details><summary>Leveringshistorikk (inntil 250 siste)</summary><ul>{data.deliveries.map((delivery) => <li key={delivery.id}>{delivery.recipient_domain} · {delivery.email_type === 'newsletter_test' ? 'Testmail' : 'Nyhetsbrev'} · {delivery.status}{delivery.failure_reason ? ` · ${delivery.failure_reason}` : ''}</li>)}</ul></details>}
      </>}
    </section>}
    {message && <p role="status">{message}</p>}
    <ConfirmDialog open={confirm} destructive={false} eyebrow="Bekreft utsending" title="Bestille utsending?" description="Nyhetsbrevet sendes til utvalgte grupper. Allerede behandlede leveringer sendes ikke på nytt ved gjenopptaking. Kontroller forhåndsvisning og testmail før du fortsetter." confirmLabel="Bestill utsending" busy={busy} onCancel={() => setConfirm(false)} onConfirm={() => action('send')} />
  </div>;
}
