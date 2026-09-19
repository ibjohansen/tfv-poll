'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { analyzeCmsContent } from '@/lib/cms-quality';
import { cmsCategories, createSlug, isValidCmsSlug, normalizeSlugInput } from '@/lib/cms-validation';
import { fileTypeLabel, formatFileSize } from '@/lib/file-format';
import { useI18n } from '@/components/LocaleProvider';

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false, loading: () => <p role="status">Laster tekstverktøy …</p> });
const emptyPage = { title: '', slug: '', intro: '', body: '', body_rich_text: null, category: cmsCategories[0], image_alt: '', image_caption: '', image_decorative: false, status: 'draft', version: 1, image: null, attachments: [] };

function payload(page, status, overrideReason) {
  return { title: page.title, slug: page.slug, intro: page.intro || '', body: page.body || '', bodyRichText: page.body_rich_text || null, category: page.category, imageAlt: page.image_alt || '', imageCaption: page.image_caption || '', imageDecorative: Boolean(page.image_decorative), status, expectedVersion: page.id ? page.version : undefined, overrideReason };
}
const latestVersion = (current, candidate) => Math.max(Number(current.version) || 1, Number(candidate) || 1);

function findingText(item) {
  return ({ missingTitle: 'Tittel mangler.', longTitle: `Tittelen er lang (${item.values?.count || 0} tegn).`, missingIntro: 'Ingress mangler.', missingImageAlt: 'Bildet trenger alt-tekst eller må markeres som dekorativt.', weakImageAlt: 'Alt-teksten må beskrive motivet mer presist.', missingDocumentTitle: 'Et dokument mangler visningsnavn.', invalidRichText: 'Hovedteksten inneholder innhold som ikke støttes.', headingJump: 'Overskriftsnivåene hopper over et nivå.', emptyLink: 'En lenke mangler adresse.', genericLink: 'Bruk en beskrivende lenketekst i stedet for «klikk her/les mer».', emptyBody: 'Hovedtekst mangler.' })[item.code] || item.code;
}

export default function CmsPageEditor({ initialPage, returnPath, storageConfigured }) {
  const { t, formatLocale } = useI18n('cms.admin');
  const [page, setPage] = useState(initialPage || emptyPage);
  const [saved, setSaved] = useState(initialPage || emptyPage);
  const [slugEdited, setSlugEdited] = useState(Boolean(initialPage?.id));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(null);
  const [findings, setFindings] = useState([]);
  const [overrideReason, setOverrideReason] = useState('');
  const [revisions, setRevisions] = useState([]);
  const [media, setMedia] = useState([]);
  const [showMedia, setShowMedia] = useState(false);
  const [mediaFilters, setMediaFilters] = useState({ search: '', type: '', since: '' });
  const [uploads, setUploads] = useState([]);
  const controller = useRef(null);
  const requestId = useRef(0);
  const dirty = useMemo(() => JSON.stringify(payload(page, page.status, '')) !== JSON.stringify(payload(saved, saved.status, '')), [page, saved]);
  const set = (name, value) => setPage((current) => ({ ...current, [name]: value }));

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!page.id) return;
    fetch(`/api/admin/cms/pages/${page.id}/revisions`).then((response) => response.json()).then((body) => body.ok && setRevisions(body.revisions)).catch(() => {});
  }, [page.id, page.version]);

  function focusFinding(items) {
    const target = document.getElementById(items[0]?.field);
    target?.focus(); target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function save(status = 'draft') {
    if (!page.title.trim() || !isValidCmsSlug(page.slug)) { setMessage(t('validTitle')); document.getElementById(!page.title.trim() ? 'cms-title' : 'cms-slug')?.focus(); return null; }
    const quality = analyzeCmsContent({ ...page, imageAlt: page.image_alt, imageDecorative: page.image_decorative });
    if (status === 'published') {
      setFindings(quality);
      const errors = quality.filter(({ severity }) => severity === 'error');
      const warnings = quality.filter(({ severity }) => severity === 'warning');
      if (errors.length) { setMessage('Rett feilene før publisering.'); focusFinding(errors); return null; }
      if (warnings.length && overrideReason.trim().length < 10) { setMessage('Begrunn hvorfor advarslene kan overstyres (minst 10 tegn).'); document.getElementById('cms-override-reason')?.focus(); return null; }
    }
    controller.current?.abort();
    const ownId = ++requestId.current;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setMessage(status === 'published' ? 'Publiserer …' : 'Lagrer …'); setConflict(null);
    try {
      const isNew = !page.id;
      const response = await fetch(isNew ? '/api/admin/cms/pages' : `/api/admin/cms/pages/${page.id}`, { method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(page, status, overrideReason)), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20000)]) });
      const body = await response.json();
      if (ownId !== requestId.current) return null;
      if (body.conflict) { setConflict(body.currentPage); throw new Error(body.message); }
      if (!response.ok) { if (body.findings) setFindings(body.findings); throw new Error(body.message); }
      setPage(body.page); setSaved(body.page); setFindings([]); setOverrideReason('');
      setMessage(status === 'published' ? 'Siden er publisert.' : `Lagret ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
      if (isNew) window.history.replaceState(null, '', `/admin/web/${body.page.id}?return=${encodeURIComponent(returnPath)}`);
      return body.page;
    } catch (error) { if (!abort.signal.aborted) setMessage(error.message || t('saveError')); return null; }
    finally { if (ownId === requestId.current) { controller.current = null; setBusy(false); } }
  }

  async function changeStatus(status) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/admin/cms/pages/${page.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, expectedVersion: page.version, overrideReason }) });
      const body = await response.json();
      if (body.conflict) { setConflict(body.currentPage); throw new Error(body.message); }
      if (!response.ok) { if (body.findings) setFindings(body.findings); throw new Error(body.message); }
      setPage(body.page); setSaved(body.page); setMessage(status === 'draft' ? 'Siden er avpublisert.' : 'Status er endret.');
    } catch (error) { setMessage(error.message || t('statusError')); }
    finally { setBusy(false); }
  }

  async function ensurePage() {
    if (page.id) return page;
    const created = await save('draft');
    if (!created) throw new Error('Lagre siden før filopplasting.');
    return created;
  }

  async function uploadOne(owner, file, kind) {
    const key = `${file.name}-${file.size}-${file.lastModified}`;
    setUploads((current) => [...current.filter((item) => item.key !== key), { key, name: file.name, status: 'Laster opp' }]);
    const form = new FormData(); form.set('file', file);
    try {
      const response = await fetch(`/api/admin/cms/pages/${owner.id}/${kind === 'image' ? 'image' : 'attachments'}`, { method: 'POST', body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setPage((current) => kind === 'image' ? { ...current, image: body.image, version: latestVersion(current, body.pageVersion) } : { ...current, attachments: [...current.attachments, body.attachment], version: latestVersion(current, body.pageVersion) });
      setSaved((current) => ({ ...current, version: latestVersion(current, body.pageVersion) }));
      setUploads((current) => current.map((item) => item.key === key ? { ...item, status: 'Ferdig' } : item));
    } catch (error) {
      setUploads((current) => current.map((item) => item.key === key ? { ...item, status: 'Feilet', file, kind, error: error.message } : item));
    }
  }

  async function uploadFiles(files, kind) {
    if (!files.length) return;
    const owner = await ensurePage().catch((error) => { setMessage(error.message); return null; });
    if (!owner) return;
    const queue = [...files];
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => { while (queue.length) await uploadOne(owner, queue.shift(), kind); }));
  }

  async function loadMedia(filters = mediaFilters) {
    const response = await fetch(`/api/admin/cms/media?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value))}`);
    const body = await response.json();
    if (body.ok) setMedia(body.media); else setMessage(body.message);
  }

  async function openMedia() {
    setShowMedia(true);
    await loadMedia();
  }

  async function renameAttachment(file) {
    const response = await fetch(`/api/admin/cms/pages/${page.id}/attachments/${file.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: file.title }) });
    const body = await response.json();
    if (!response.ok) { setMessage(body.message); return; }
    setPage((current) => ({ ...current, version: latestVersion(current, body.pageVersion), attachments: current.attachments.map((item) => item.id === file.id ? body.attachment : item) }));
    setSaved((current) => ({ ...current, version: latestVersion(current, body.pageVersion) })); setMessage('Dokumentnavnet er lagret.');
  }

  async function moveAttachment(index, direction) {
    const attachments = [...page.attachments];
    const target = index + direction;
    if (target < 0 || target >= attachments.length) return;
    [attachments[index], attachments[target]] = [attachments[target], attachments[index]];
    setPage((current) => ({ ...current, attachments }));
    const response = await fetch(`/api/admin/cms/pages/${page.id}/attachments`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: attachments.map(({ id }) => id) }) });
    const body = await response.json();
    if (!response.ok) { setPage((current) => ({ ...current, attachments: page.attachments })); setMessage(body.message); return; }
    setPage((current) => ({ ...current, version: latestVersion(current, body.pageVersion) })); setSaved((current) => ({ ...current, version: latestVersion(current, body.pageVersion) }));
  }

  async function removeFile(file, kind) {
    if (!confirm(`Fjerne ${kind === 'image' ? 'bildet' : `«${file.title}»`}? Filen beholdes i versjonshistorikken.`)) return;
    const endpoint = kind === 'image' ? `/api/admin/cms/pages/${page.id}/image` : `/api/admin/cms/pages/${page.id}/attachments/${file.id}`;
    const response = await fetch(endpoint, { method: 'DELETE', ...(kind === 'image' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageId: file.id }) } : {}) });
    const body = await response.json();
    if (!response.ok) { setMessage(body.message); return; }
    setPage((current) => kind === 'image' ? { ...current, image: null, version: latestVersion(current, body.pageVersion) } : { ...current, attachments: current.attachments.filter(({ id }) => id !== file.id), version: latestVersion(current, body.pageVersion) });
    setSaved((current) => ({ ...current, version: latestVersion(current, body.pageVersion) }));
  }

  async function reuse(file) {
    const owner = await ensurePage();
    const response = await fetch('/api/admin/cms/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: owner.id, fileId: file.id }) });
    const body = await response.json();
    if (!response.ok) { setMessage(body.message); return; }
    setPage((current) => body.file.kind === 'image' ? { ...current, image: body.file, version: latestVersion(current, body.pageVersion) } : { ...current, attachments: [...current.attachments, body.file], version: latestVersion(current, body.pageVersion) });
    setSaved((current) => ({ ...current, version: latestVersion(current, body.pageVersion) })); setShowMedia(false); setMessage('Filen er gjenbrukt på siden.');
  }

  async function restore(revision) {
    if (!confirm(`Gjenopprette revisjon ${revision}? Dagens innhold beholdes i historikken.`)) return;
    const response = await fetch(`/api/admin/cms/pages/${page.id}/revisions/${revision}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: page.version }) });
    const body = await response.json();
    if (!response.ok) { if (body.conflict) setConflict(body.currentPage); setMessage(body.message); return; }
    setPage(body.page); setSaved(body.page); setMessage(`Revisjon ${revision} er gjenopprettet som en ny revisjon.`);
  }

  return <div className="cms-editor-page">
    <header className="cms-editor-page-header"><div><p className="eyebrow">{page.id ? 'Rediger nettside' : 'Ny nettside'}</p><h1>{page.title || 'Uten tittel'}</h1><span className={`admin-save-status is-${dirty ? 'dirty' : 'saved'}`} role="status">{dirty ? 'Ulagrede endringer' : 'Alle endringer lagret'}</span></div><Link className="admin-button" href={returnPath}>Tilbake til listen</Link></header>
    {conflict && <section className="cms-conflict" role="alert"><h2>Nyere versjon finnes</h2><p>En annen fane eller redaktør har lagret siden. Velg hvilken versjon du vil arbeide videre med.</p><button className="primary-button" type="button" onClick={() => { setPage(conflict); setSaved(conflict); setConflict(null); }}>Last inn serverversjonen</button><button className="admin-button" type="button" onClick={() => navigator.clipboard.writeText(JSON.stringify(payload(page, page.status, '')))}>Kopier mitt utkast</button></section>}
    <form className="cms-editor-form" onSubmit={(event) => { event.preventDefault(); void save('draft'); }}>
      <div className="cms-editor-actions"><button className="admin-button" type="submit" disabled={busy}>{busy ? 'Arbeider …' : 'Lagre utkast'}</button><button className="primary-button" type="button" disabled={busy} onClick={() => save('published')}>Publiser</button>{page.id && page.status === 'published' && <button className="admin-button" type="button" disabled={busy} onClick={() => changeStatus('draft')}>Avpubliser</button>}{page.id && <Link className="admin-button" href={`/admin/web/preview/${page.id}`} target="_blank">Forhåndsvis</Link>}</div>
      <fieldset disabled={busy}><legend className="visually-hidden">Sideinnhold</legend>
        <section className="cms-editor-section"><h2>Innhold</h2><label htmlFor="cms-title">{t('title')} *<input id="cms-title" value={page.title} maxLength={120} required onChange={(event) => setPage((current) => ({ ...current, title: event.target.value, slug: slugEdited ? current.slug : createSlug(event.target.value) }))} /></label><label htmlFor="cms-intro">{t('intro')}<textarea id="cms-intro" value={page.intro || ''} maxLength={500} rows={4} onChange={(event) => set('intro', event.target.value)} /></label><div id="cms-body"><RichTextEditor value={page.body_rich_text} plainText={page.body} disabled={busy} onChange={(value) => set('body_rich_text', value)} /></div></section>
        <section className="cms-editor-section"><h2>Bilde og dokumenter</h2>{page.image && <div className="cms-image-preview"><Image src={page.image.thumbnail_url || page.image.url} alt="" width={320} height={210} unoptimized /><span>{page.image.original_filename}</span><button className="admin-button is-danger" type="button" onClick={() => removeFile(page.image, 'image')}>Fjern bilde</button></div>}<div className="cms-file-pickers"><label className="admin-button">{page.image ? 'Bytt bilde' : 'Last opp bilde'}<input className="visually-hidden" type="file" accept=".jpg,.jpeg,.png,.webp" disabled={!storageConfigured} onChange={(event) => { void uploadFiles([...event.target.files], 'image'); event.target.value = ''; }} /></label><label className="admin-button">Legg til dokumenter<input className="visually-hidden" type="file" multiple disabled={!storageConfigured} onChange={(event) => { void uploadFiles([...event.target.files], 'attachment'); event.target.value = ''; }} /></label><button className="admin-button" type="button" disabled={!storageConfigured} onClick={openMedia}>Velg fra mediebibliotek</button></div>
          <label htmlFor="cms-image-alt">Alt-tekst<input id="cms-image-alt" value={page.image_alt || ''} maxLength={300} disabled={page.image_decorative} onChange={(event) => set('image_alt', event.target.value)} /></label><label className="cms-checkbox"><input type="checkbox" checked={Boolean(page.image_decorative)} onChange={(event) => set('image_decorative', event.target.checked)} /> Bildet er kun dekorativt</label><label htmlFor="cms-caption">Bildetekst<input id="cms-caption" value={page.image_caption || ''} maxLength={500} onChange={(event) => set('image_caption', event.target.value)} /></label>
          <ul className="cms-attachment-editor">{page.attachments.map((file, index) => <li key={file.id}><label htmlFor={`cms-file-title-${file.id}`}>Visningsnavn<input id={`cms-file-title-${file.id}`} value={file.title} maxLength={200} onChange={(event) => set('attachments', page.attachments.map((item) => item.id === file.id ? { ...item, title: event.target.value } : item))} /></label><small>{fileTypeLabel(file.mime_type, file.original_filename, t('file'))} · {formatFileSize(file.size_bytes, formatLocale)}</small><div className="cms-file-actions"><button className="admin-button" type="button" onClick={() => renameAttachment(file)}>Lagre navn</button><button className="admin-button" type="button" disabled={index === 0} onClick={() => moveAttachment(index, -1)}>Opp</button><button className="admin-button" type="button" disabled={index === page.attachments.length - 1} onClick={() => moveAttachment(index, 1)}>Ned</button><button className="admin-button is-danger" type="button" onClick={() => removeFile(file, 'attachment')}>Fjern</button></div></li>)}</ul>
          {uploads.length > 0 && <ul className="cms-upload-progress" aria-live="polite">{uploads.map((item) => <li key={item.key}>{item.name}: {item.status}{item.status === 'Feilet' && <button type="button" onClick={() => uploadFiles([item.file], item.kind)}>Prøv igjen</button>}</li>)}</ul>}
        </section>
        <section className="cms-editor-section"><h2>Lenke og synlighet</h2><label htmlFor="cms-slug">URL *<span className="cms-slug-field"><span>/</span><input id="cms-slug" value={page.slug} required onChange={(event) => { setSlugEdited(true); set('slug', normalizeSlugInput(event.target.value)); }} /></span></label><label>Kategori<select value={page.category} onChange={(event) => set('category', event.target.value)}>{cmsCategories.map((category) => <option key={category}>{category}</option>)}</select></label></section>
        <section className="cms-editor-section"><h2>Publisering og kvalitet</h2>{findings.length > 0 && <ul className="cms-quality-list">{findings.map((item) => <li key={item.id} className={`is-${item.severity}`}><button type="button" onClick={() => focusFinding([item])}>{item.severity === 'error' ? 'Feil' : 'Advarsel'}: {findingText(item)}</button></li>)}</ul>}<label htmlFor="cms-override-reason">Begrunnelse for å overstyre advarsler<textarea id="cms-override-reason" value={overrideReason} maxLength={1000} rows={3} onChange={(event) => setOverrideReason(event.target.value)} /></label>{page.has_unpublished_changes && <p className="admin-field-note">Den offentlige siden viser fortsatt sist publiserte revisjon.</p>}{page.id && <p>Status: <strong>{page.status === 'published' ? 'Publisert' : 'Utkast'}</strong> · Revisjon {page.version}</p>}</section>
      </fieldset>
      {message && <p className="cms-editor-message" role="status">{message}</p>}
    </form>
    {page.id && <section className="cms-history"><h2>Versjonshistorikk</h2><ul>{revisions.map((revision) => <li key={revision.revision_number}><span>Revisjon {revision.revision_number} · {revision.revision_status} · {new Date(revision.created_at).toLocaleString()}</span>{revision.revision_number !== page.version && <button className="admin-button" type="button" onClick={() => restore(revision.revision_number)}>Gjenopprett</button>}</li>)}</ul></section>}
    {showMedia && <div className="cms-media-dialog" role="dialog" aria-modal="true" aria-label="Mediebibliotek"><div><header><h2>Mediebibliotek</h2><button className="admin-button" type="button" onClick={() => setShowMedia(false)}>Lukk</button></header><p>Filer er private og kopieres til denne siden ved gjenbruk. Sletting fra en side beholder filen i historikken.</p><form className="cms-media-filters" onSubmit={(event) => { event.preventDefault(); void loadMedia(); }}><label>Søk<input type="search" value={mediaFilters.search} onChange={(event) => setMediaFilters((current) => ({ ...current, search: event.target.value }))} /></label><label>Type<select value={mediaFilters.type} onChange={(event) => setMediaFilters((current) => ({ ...current, type: event.target.value }))}><option value="">Alle</option><option value="image">Bilder</option><option value="attachment">Dokumenter</option></select></label><label>Fra dato<input type="date" value={mediaFilters.since} onChange={(event) => setMediaFilters((current) => ({ ...current, since: event.target.value }))} /></label><button className="admin-button" type="submit">Filtrer</button></form><ul>{media.map((file) => <li key={file.id}>{file.kind === 'image' && file.thumbnail_url && <Image src={file.thumbnail_url} alt="" width={120} height={80} unoptimized />}<span><strong>{file.title}</strong><small>{file.page_title} · {new Date(file.created_at).toLocaleDateString()} · {file.revision_uses} revisjoner</small></span><button className="admin-button" type="button" onClick={() => reuse(file)}>Bruk</button></li>)}</ul></div></div>}
  </div>;
}
