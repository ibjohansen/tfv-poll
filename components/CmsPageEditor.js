'use client';

import { useApiClient } from '@/components/useApiClient';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { analyzeCmsContent } from '@/lib/cms-quality';
import { cmsCategories, createSlug, isValidCmsSlug, normalizeSlugInput } from '@/lib/cms-validation';
import { fileTypeLabel, formatFileSize } from '@/lib/file-format';
import { useI18n } from '@/components/LocaleProvider';
import { emptyCmsPage as emptyPage, cmsEditorPayload as payload, latestCmsVersion as latestVersion } from '@/lib/cms-editor';

function EditorLoading() {
  const { t } = useI18n('cms.admin');
  return <p role="status">{t('loadingEditor')}</p>;
}
const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false, loading: EditorLoading });

export default function CmsPageEditor({ initialPage, returnPath, storageConfigured }) {
  const apiFetch = useApiClient();
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
    const abort = new AbortController();
    apiFetch(`/api/admin/cms/pages/${page.id}/revisions`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]) })
      .then((response) => response.json()).then((body) => {
        if (!abort.signal.aborted) {
          if (body.ok) setRevisions(body.revisions);
          else setMessage(body.message || t('historyError'));
        }
      }).catch((error) => { if (!abort.signal.aborted) setMessage(error.message || t('historyError')); });
    return () => abort.abort();
  }, [apiFetch, page.id, page.version, t]);

  async function runAction(action) {
    setBusy(true);
    try { await action(); }
    catch (error) { setMessage(error.message || t('saveError')); }
    finally { setBusy(false); }
  }

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
      if (errors.length) { setMessage(t('fixErrors')); focusFinding(errors); return null; }
      if (warnings.length && overrideReason.trim().length < 10) { setMessage(t('justifyWarnings')); document.getElementById('cms-override-reason')?.focus(); return null; }
    }
    controller.current?.abort();
    const ownId = ++requestId.current;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setMessage(status === 'published' ? t('publishing') : t('saving')); setConflict(null);
    try {
      const isNew = !page.id;
      const response = await apiFetch(isNew ? '/api/admin/cms/pages' : `/api/admin/cms/pages/${page.id}`, { method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(page, status, overrideReason)), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20000)]) });
      const body = await response.json();
      if (ownId !== requestId.current) return null;
      if (body.conflict) { setConflict(body.currentPage); throw new Error(body.message); }
      if (!response.ok) { if (body.findings) setFindings(body.findings); throw new Error(body.message); }
      setPage(body.page); setSaved(body.page); setFindings([]); setOverrideReason('');
      setMessage(status === 'published' ? t('publishedNotice') : t('savedAt', { time: new Date().toLocaleTimeString(formatLocale, { hour: '2-digit', minute: '2-digit' }) }));
      if (isNew) window.history.replaceState(null, '', `/admin/web/${body.page.id}?return=${encodeURIComponent(returnPath)}`);
      return body.page;
    } catch (error) { if (!abort.signal.aborted) setMessage(error.message || t('saveError')); return null; }
    finally { if (ownId === requestId.current) { controller.current = null; setBusy(false); } }
  }

  async function changeStatus(status) {
    setBusy(true); setMessage('');
    try {
      const response = await apiFetch(`/api/admin/cms/pages/${page.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, expectedVersion: page.version, overrideReason }) });
      const body = await response.json();
      if (body.conflict) { setConflict(body.currentPage); throw new Error(body.message); }
      if (!response.ok) { if (body.findings) setFindings(body.findings); throw new Error(body.message); }
      setPage(body.page); setSaved(body.page); setMessage(status === 'draft' ? t('unpublishedNotice') : t('statusChanged'));
    } catch (error) { setMessage(error.message || t('statusError')); }
    finally { setBusy(false); }
  }

  async function ensurePage() {
    if (page.id) return page;
    const created = await save('draft');
    if (!created) throw new Error(t('saveBeforeUpload'));
    return created;
  }

  async function uploadOne(owner, file, kind) {
    const key = `${file.name}-${file.size}-${file.lastModified}`;
    setUploads((current) => [...current.filter((item) => item.key !== key), { key, name: file.name, status: 'uploading' }]);
    const form = new FormData(); form.set('file', file);
    try {
      const response = await apiFetch(`/api/admin/cms/pages/${owner.id}/${kind === 'image' ? 'image' : 'attachments'}`, { method: 'POST', body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setPage((current) => kind === 'image' ? { ...current, image: body.image, version: latestVersion(current, body.pageVersion) } : { ...current, attachments: [...current.attachments, body.attachment], version: latestVersion(current, body.pageVersion) });
      setSaved((current) => ({ ...current, version: latestVersion(current, body.pageVersion) }));
      setUploads((current) => current.map((item) => item.key === key ? { ...item, status: 'done' } : item));
    } catch (error) {
      setUploads((current) => current.map((item) => item.key === key ? { ...item, status: 'failed', file, kind, error: error.message } : item));
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
    const response = await apiFetch(`/api/admin/cms/media?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value))}`);
    const body = await response.json();
    if (body.ok) setMedia(body.media); else setMessage(body.message);
  }

  async function openMedia() {
    setShowMedia(true);
    await loadMedia();
  }

  async function renameAttachment(file) {
    const response = await apiFetch(`/api/admin/cms/pages/${page.id}/attachments/${file.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: file.title }) });
    const body = await response.json();
    if (!response.ok) { setMessage(body.message); return; }
    setPage((current) => ({ ...current, version: latestVersion(current, body.pageVersion), attachments: current.attachments.map((item) => item.id === file.id ? body.attachment : item) }));
    setSaved((current) => ({ ...current, version: latestVersion(current, body.pageVersion) })); setMessage(t('nameSaved'));
  }

  async function moveAttachment(index, direction) {
    const attachments = [...page.attachments];
    const target = index + direction;
    if (target < 0 || target >= attachments.length) return;
    [attachments[index], attachments[target]] = [attachments[target], attachments[index]];
    const response = await apiFetch(`/api/admin/cms/pages/${page.id}/attachments`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: attachments.map(({ id }) => id) }) });
    const body = await response.json();
    if (!response.ok) { setPage((current) => ({ ...current, attachments: page.attachments })); setMessage(body.message); return; }
    setPage((current) => ({ ...current, attachments, version: latestVersion(current, body.pageVersion) })); setSaved((current) => ({ ...current, version: latestVersion(current, body.pageVersion) }));
  }

  async function removeFile(file, kind) {
    if (!confirm(t('removeFileConfirm', { title: kind === 'image' ? t('mainImage') : file.title }))) return;
    const endpoint = kind === 'image' ? `/api/admin/cms/pages/${page.id}/image` : `/api/admin/cms/pages/${page.id}/attachments/${file.id}`;
    const response = await apiFetch(endpoint, { method: 'DELETE', ...(kind === 'image' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageId: file.id }) } : {}) });
    const body = await response.json();
    if (!response.ok) { setMessage(body.message); return; }
    setPage((current) => kind === 'image' ? { ...current, image: null, version: latestVersion(current, body.pageVersion) } : { ...current, attachments: current.attachments.filter(({ id }) => id !== file.id), version: latestVersion(current, body.pageVersion) });
    setSaved((current) => ({ ...current, version: latestVersion(current, body.pageVersion) }));
  }

  async function reuse(file) {
    const owner = await ensurePage();
    const response = await apiFetch('/api/admin/cms/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: owner.id, fileId: file.id }) });
    const body = await response.json();
    if (!response.ok) { setMessage(body.message); return; }
    setPage((current) => body.file.kind === 'image' ? { ...current, image: body.file, version: latestVersion(current, body.pageVersion) } : { ...current, attachments: [...current.attachments, body.file], version: latestVersion(current, body.pageVersion) });
    setSaved((current) => ({ ...current, version: latestVersion(current, body.pageVersion) })); setShowMedia(false); setMessage(t('reused'));
  }

  async function restore(revision) {
    if (!confirm(t('restoreConfirm', { revision }))) return;
    const response = await apiFetch(`/api/admin/cms/pages/${page.id}/revisions/${revision}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: page.version }) });
    const body = await response.json();
    if (!response.ok) { if (body.conflict) setConflict(body.currentPage); setMessage(body.message); return; }
    setPage(body.page); setSaved(body.page); setMessage(t('revisionRestored', { revision }));
  }

  return <div className="cms-editor-page">
    <header className="cms-editor-page-header"><div><p className="eyebrow">{page.id ? t('editPage') : t('createPage')}</p><h1>{page.title || t('untitled')}</h1><span className={`admin-save-status is-${dirty ? 'dirty' : 'saved'}`} role="status">{dirty ? t('unsaved') : t('saveStates.saved')}</span></div><Link className="admin-button" href={returnPath}>{t('backToList')}</Link></header>
    {conflict && <section className="cms-conflict" role="alert"><h2>{t('conflictTitle')}</h2><p>{t('conflictHelp')}</p><button className="primary-button" type="button" onClick={() => { setPage(conflict); setSaved(conflict); setConflict(null); }}>{t('loadServerVersion')}</button><button className="admin-button" type="button" onClick={() => runAction(() => navigator.clipboard.writeText(JSON.stringify(payload(page, page.status, ''))))}>{t('copyDraft')}</button></section>}
    <form className="cms-editor-form" onSubmit={(event) => { event.preventDefault(); void save('draft'); }}>
      <div className="cms-editor-actions"><button className="admin-button" type="submit" disabled={busy}>{busy ? t('working') : t('saveDraft')}</button><button className="primary-button" type="button" disabled={busy} onClick={() => save('published')}>{t('publish')}</button>{page.id && page.status === 'published' && <button className="admin-button" type="button" disabled={busy} onClick={() => changeStatus('draft')}>{t('unpublish')}</button>}{page.id && <Link className="admin-button" href={`/admin/web/preview/${page.id}`} target="_blank">{t('preview')}</Link>}</div>
      <fieldset disabled={busy}><legend className="visually-hidden">{t('pageContent')}</legend>
        <section className="cms-editor-section"><h2>{t('content')}</h2><label htmlFor="cms-title">{t('title')} *<input id="cms-title" value={page.title} maxLength={120} required onChange={(event) => setPage((current) => ({ ...current, title: event.target.value, slug: slugEdited ? current.slug : createSlug(event.target.value) }))} /></label><label htmlFor="cms-intro">{t('intro')}<textarea id="cms-intro" value={page.intro || ''} maxLength={500} rows={4} onChange={(event) => set('intro', event.target.value)} /></label><div id="cms-body"><RichTextEditor value={page.body_rich_text} plainText={page.body} disabled={busy} onChange={(value) => set('body_rich_text', value)} /></div></section>
        <section className="cms-editor-section"><h2>{t('mediaTitle')}</h2>{page.image && <div className="cms-image-preview"><Image src={page.image.thumbnail_url || page.image.url} alt="" width={320} height={210} unoptimized /><span>{page.image.original_filename}</span><button className="admin-button is-danger" type="button" onClick={() => runAction(() => removeFile(page.image, 'image'))}>{t('removeImage')}</button></div>}<div className="cms-file-pickers"><label className="admin-button">{page.image ? t('changeImage') : t('uploadImage')}<input className="visually-hidden" type="file" accept=".jpg,.jpeg,.png,.webp" disabled={!storageConfigured} onChange={(event) => { void uploadFiles([...event.target.files], 'image'); event.target.value = ''; }} /></label><label className="admin-button">{t('addFiles')}<input className="visually-hidden" type="file" multiple disabled={!storageConfigured} onChange={(event) => { void uploadFiles([...event.target.files], 'attachment'); event.target.value = ''; }} /></label><button className="admin-button" type="button" disabled={!storageConfigured} onClick={() => runAction(openMedia)}>{t('chooseMedia')}</button></div>
          <label htmlFor="cms-image-alt">{t('altText')}<input id="cms-image-alt" value={page.image_alt || ''} maxLength={300} disabled={page.image_decorative} onChange={(event) => set('image_alt', event.target.value)} /></label><label className="cms-checkbox"><input type="checkbox" checked={Boolean(page.image_decorative)} onChange={(event) => set('image_decorative', event.target.checked)} /> {t('decorative')}</label><label htmlFor="cms-caption">{t('imageCaption')}<input id="cms-caption" value={page.image_caption || ''} maxLength={500} onChange={(event) => set('image_caption', event.target.value)} /></label>
          <ul className="cms-attachment-editor">{page.attachments.map((file, index) => <li key={file.id}><label htmlFor={`cms-file-title-${file.id}`}>{t('displayName')}<input id={`cms-file-title-${file.id}`} value={file.title} maxLength={200} onChange={(event) => set('attachments', page.attachments.map((item) => item.id === file.id ? { ...item, title: event.target.value } : item))} /></label><small>{fileTypeLabel(file.mime_type, file.original_filename, t('file'))} · {formatFileSize(file.size_bytes, formatLocale)}</small><div className="cms-file-actions"><button className="admin-button" type="button" onClick={() => runAction(() => renameAttachment(file))}>{t('saveName')}</button><button className="admin-button" type="button" disabled={index === 0} onClick={() => runAction(() => moveAttachment(index, -1))}>{t('up')}</button><button className="admin-button" type="button" disabled={index === page.attachments.length - 1} onClick={() => runAction(() => moveAttachment(index, 1))}>{t('down')}</button><button className="admin-button is-danger" type="button" onClick={() => runAction(() => removeFile(file, 'attachment'))}>{t('remove')}</button></div></li>)}</ul>
          {uploads.length > 0 && <ul className="cms-upload-progress" aria-live="polite">{uploads.map((item) => <li key={item.key}>{item.name}: {t(`uploadStates.${item.status}`)}{item.status === 'failed' && <button type="button" onClick={() => uploadFiles([item.file], item.kind)}>{t('retry')}</button>}</li>)}</ul>}
        </section>
        <section className="cms-editor-section"><h2>{t('visibility')}</h2><label htmlFor="cms-slug">{t('slug')} *<span className="cms-slug-field"><span>/</span><input id="cms-slug" value={page.slug} required onChange={(event) => { setSlugEdited(true); set('slug', normalizeSlugInput(event.target.value)); }} /></span></label><label>{t('category')}<select value={page.category} onChange={(event) => set('category', event.target.value)}>{cmsCategories.map((category) => <option key={category} value={category}>{t(`categories.${category}`)}</option>)}</select></label></section>
        <section className="cms-editor-section"><h2>{t('quality')}</h2>{findings.length > 0 && <ul className="cms-quality-list">{findings.map((item) => <li key={item.id} className={`is-${item.severity}`}><button type="button" onClick={() => focusFinding([item])}>{item.severity === 'error' ? t('error') : t('warning')}: {t(`findings.${item.code}`, item.values)}</button></li>)}</ul>}<label htmlFor="cms-override-reason">{t('overrideReason')}<textarea id="cms-override-reason" value={overrideReason} maxLength={1000} rows={3} onChange={(event) => setOverrideReason(event.target.value)} /></label>{page.has_unpublished_changes && <p className="admin-field-note">{t('stillPublished')}</p>}{page.id && <p>{t('status')}: <strong>{page.status === 'published' ? t('published') : t('draft')}</strong> · {t('revision', { revision: page.version })}</p>}</section>
      </fieldset>
      {message && <p className="cms-editor-message" role="status">{message}</p>}
    </form>
    {page.id && <section className="cms-history"><h2>{t('history')}</h2><ul>{revisions.map((revision) => <li key={revision.revision_number}><span>{t('revision', { revision: revision.revision_number })} · {t(revision.revision_status === 'published' ? 'published' : 'draft')} · {new Date(revision.created_at).toLocaleString(formatLocale)}</span>{revision.revision_number !== page.version && <button className="admin-button" type="button" onClick={() => runAction(() => restore(revision.revision_number))}>{t('restore')}</button>}</li>)}</ul></section>}
    {showMedia && <div className="cms-media-dialog" role="dialog" aria-modal="true" aria-label={t('mediaLibrary')}><div><header><h2>{t('mediaLibrary')}</h2><button className="admin-button" type="button" onClick={() => setShowMedia(false)}>{t('close')}</button></header><p>{t('mediaHelp')}</p><form className="cms-media-filters" onSubmit={(event) => { event.preventDefault(); void runAction(() => loadMedia()); }}><label>{t('search')}<input type="search" value={mediaFilters.search} onChange={(event) => setMediaFilters((current) => ({ ...current, search: event.target.value }))} /></label><label>{t('type')}<select value={mediaFilters.type} onChange={(event) => setMediaFilters((current) => ({ ...current, type: event.target.value }))}><option value="">{t('all')}</option><option value="image">{t('images')}</option><option value="attachment">{t('documents')}</option></select></label><label>{t('since')}<input type="date" value={mediaFilters.since} onChange={(event) => setMediaFilters((current) => ({ ...current, since: event.target.value }))} /></label><button className="admin-button" type="submit">{t('filter')}</button></form><ul>{media.map((file) => <li key={file.id}>{file.kind === 'image' && file.thumbnail_url && <Image src={file.thumbnail_url} alt="" width={120} height={80} unoptimized />}<span><strong>{file.title}</strong><small>{file.page_title} · {new Date(file.created_at).toLocaleDateString(formatLocale)} · {t('revisionUses', { count: file.revision_uses })}</small></span><button className="admin-button" type="button" onClick={() => runAction(() => reuse(file))}>{t('use')}</button></li>)}</ul></div></div>}
  </div>;
}
