'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import RichTextEditor from '@/components/RichTextEditor';
import { cmsCategories, createSlug, isValidCmsSlug, normalizeSlugInput } from '@/lib/cms-validation';
import { fileTypeLabel, formatFileSize } from '@/lib/file-format';
import { useI18n } from '@/components/LocaleProvider';

const emptyPage = {
  title: '',
  slug: '',
  intro: '',
  body: '',
  category: cmsCategories[0],
  image_alt: '',
  image_caption: '',
  status: 'draft',
  image: null,
  attachments: [],
};
function formatDate(value, locale) {
  return value ? new Date(value).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function isErrorMessage(message) {
  return /kunne|må |ikke|feil|større|støttes|could not|must|invalid|failed|error|not /i.test(message);
}

function pagePayload(page, status) {
  return {
    title: page.title,
    slug: page.slug,
    intro: page.intro || '',
    body: page.body || '',
    bodyRichText: page.body_rich_text || null,
    category: page.category,
    imageAlt: page.image_alt || '',
    imageCaption: page.image_caption || '',
    status,
  };
}

const pageKey = (page, status = page?.status) => page ? JSON.stringify(pagePayload(page, status)) : '';

export default function CmsPageDirectory({ pages, search, storageConfigured }) {
  const { t, formatLocale } = useI18n('cms.admin');
  const router = useRouter();
  const [selected, setSelected] = useState(null);
  const [slugEdited, setSlugEdited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const [savedPageKey, setSavedPageKey] = useState('');
  const latestPageKey = useRef('');
  const [message, setMessage] = useState('');
  const [listMessage, setListMessage] = useState('');
  const [deleteCandidate, setDeleteCandidate] = useState(null);

  function update(name, value) {
    setSelected((current) => ({ ...current, [name]: value }));
  }

  function newPage() {
    setSelected({ ...emptyPage, isNew: true });
    setSlugEdited(false);
    setMessage('');
    setSavedPageKey('');
    setSaveState('idle');
  }

  async function editPage(summary) {
    setLoading(true);
    setMessage('');
    setListMessage('');
    try {
      const response = await fetch(`/api/admin/cms/pages/${summary.id}`);
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || t('loadError'));
      setSelected(body.page);
      setSavedPageKey(pageKey(body.page));
      setSaveState('saved');
      setSlugEdited(true);
    } catch (error) {
      setListMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  const persistPage = useCallback(async (page, requestedStatus, wasNew) => {
    setBusy(true);
    setSaveState('saving');
    setMessage('');
    try {
      const response = await fetch(wasNew ? '/api/admin/cms/pages' : `/api/admin/cms/pages/${page.id}`, {
        method: wasNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pagePayload(page, requestedStatus)),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || t('saveError'));
      setSavedPageKey(pageKey(body.page));
      setSelected((current) => latestPageKey.current === pageKey(page, requestedStatus) ? body.page : current);
      setSlugEdited(true);
      setSaveState(latestPageKey.current === pageKey(page, requestedStatus) ? 'saved' : 'dirty');
      setMessage(wasNew ? t(requestedStatus === 'published' ? 'savedPublished' : 'draftCreated') : '');
      router.refresh();
    } catch (error) {
      setMessage(error.message);
      setSaveState('error');
    } finally {
      setBusy(false);
    }
  }, [router, t]);

  async function save(event) {
    event.preventDefault();
    const requestedStatus = event.nativeEvent.submitter?.value === 'published' ? 'published' : 'draft';
    await persistPage(selected, requestedStatus, selected.isNew);
  }

  const selectedPageKey = pageKey(selected);
  const displayedSaveState = saveState === 'saved' && selectedPageKey !== savedPageKey ? 'dirty' : saveState;
  useEffect(() => { latestPageKey.current = selectedPageKey; }, [selectedPageKey]);
  useEffect(() => {
    if (!selected?.id || selected.isNew || busy || selectedPageKey === savedPageKey) return undefined;
    if (!selected.title.trim() || !isValidCmsSlug(selected.slug)) return undefined;
    const snapshot = selected;
    const timer = setTimeout(() => persistPage(snapshot, snapshot.status, false), 900);
    return () => clearTimeout(timer);
  }, [busy, persistPage, savedPageKey, selected, selectedPageKey]);

  async function ensureDraftForUpload() {
    if (selected?.id) return { page: selected, created: false };
    if (!selected?.title?.trim() || !isValidCmsSlug(selected?.slug)) {
      throw new Error(t('validTitle'));
    }
    const response = await fetch('/api/admin/cms/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pagePayload(selected, 'draft')),
    });
    const body = await response.json();
    if (!response.ok || !body.ok) throw new Error(body.message || t('draftUploadError'));
    setSelected(body.page);
    setSavedPageKey(pageKey(body.page));
    setSaveState('saved');
    setSlugEdited(true);
    router.refresh();
    return { page: body.page, created: true };
  }

  async function changeStatus(page) {
    const status = page.status === 'published' ? 'draft' : 'published';
    setListMessage('');
    try {
      const response = await fetch(`/api/admin/cms/pages/${page.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || t('statusError'));
      setListMessage(t(status === 'published' ? 'publishedNotice' : 'unpublishedNotice'));
      router.refresh();
    } catch (error) {
      setListMessage(error.message);
    }
  }

  async function uploadImage(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setMessage('');
    let createdDraft = false;
    try {
      const persisted = await ensureDraftForUpload();
      createdDraft = persisted.created;
      const form = new FormData();
      form.set('file', file);
      const response = await fetch(`/api/admin/cms/pages/${persisted.page.id}/image`, { method: 'POST', body: form });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || t('imageUploadError'));
      setSelected((current) => ({ ...(current?.id === persisted.page.id ? current : persisted.page), image: body.image }));
      setMessage(t('imageUploaded', {draft: createdDraft ? t('draftPrefix') : ''}));
      router.refresh();
    } catch (error) {
      setMessage(`${createdDraft ? t('draftButPrefix') : ''}${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function uploadAttachments(event) {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    if (!files.length) return;
    setBusy(true);
    setMessage('');
    let createdDraft = false;
    let persistedPage = null;
    const uploaded = [];
    try {
      const persisted = await ensureDraftForUpload();
      createdDraft = persisted.created;
      persistedPage = persisted.page;
      for (const file of files) {
        const form = new FormData();
        form.set('file', file);
        const response = await fetch(`/api/admin/cms/pages/${persisted.page.id}/attachments`, { method: 'POST', body: form });
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.message || t('attachmentUploadError', {name: file.name}));
        uploaded.push(body.attachment);
      }
      setSelected((current) => {
        const page = current?.id === persisted.page.id ? current : persisted.page;
        return { ...page, attachments: [...page.attachments, ...uploaded] };
      });
      setMessage(t('attachmentsUploaded', {draft: createdDraft ? t('draftPrefix') : '', count: uploaded.length}));
      router.refresh();
    } catch (error) {
      if (uploaded.length && persistedPage) {
        setSelected((current) => {
          const page = current?.id === persistedPage.id ? current : persistedPage;
          return { ...page, attachments: [...page.attachments, ...uploaded] };
        });
        router.refresh();
      }
      const partial = uploaded.length ? t('partialUpload', {count: uploaded.length}) : '';
      setMessage(`${createdDraft ? t('draftPrefix') : ''}${partial}${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function renameAttachment(file) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/cms/pages/${selected.id}/attachments/${file.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: file.title }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || t('renameError'));
      setMessage(t('nameSaved'));
      router.refresh();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function moveAttachment(index, direction) {
    const original = selected.attachments;
    const reordered = [...original];
    const target = index + direction;
    if (target < 0 || target >= reordered.length) return;
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setSelected((current) => ({ ...current, attachments: reordered }));
    try {
      const response = await fetch(`/api/admin/cms/pages/${selected.id}/attachments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: reordered.map(({ id }) => id) }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || t('orderError'));
      router.refresh();
    } catch (error) {
      setSelected((current) => ({ ...current, attachments: original }));
      setMessage(error.message);
    }
  }

  async function confirmDelete() {
    const candidate = deleteCandidate;
    if (!candidate) return;
    setBusy(true);
    setMessage('');
    setListMessage('');
    try {
      if (candidate.type === 'page') {
        const response = await fetch(`/api/admin/cms/pages/${candidate.page.id}`, { method: 'DELETE' });
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.message || t('deletePageError'));
        if (selected?.id === candidate.page.id) setSelected(null);
        setListMessage(t('pageDeleted'));
      } else if (candidate.type === 'image') {
        const response = await fetch(`/api/admin/cms/pages/${selected.id}/image`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageId: candidate.file.id }),
        });
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.message || t('removeImageError'));
        update('image', null);
        setMessage(t('imageRemoved'));
      } else {
        const response = await fetch(`/api/admin/cms/pages/${selected.id}/attachments/${candidate.file.id}`, { method: 'DELETE' });
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.message || t('removeAttachmentError'));
        setSelected((current) => ({ ...current, attachments: current.attachments.filter(({ id }) => id !== candidate.file.id) }));
        setMessage(t('attachmentRemoved'));
      }
      router.refresh();
    } catch (error) {
      if (candidate.type === 'page') setListMessage(error.message);
      else setMessage(error.message);
    } finally {
      setDeleteCandidate(null);
      setBusy(false);
    }
  }

  const confirmTitle = deleteCandidate?.type === 'page'
    ? t('deletePageTitle', {title: deleteCandidate.page.title})
    : deleteCandidate?.type === 'image'
      ? t('removeImageTitle')
      : t('removeAttachmentTitle', {title: deleteCandidate?.file?.title || t('attachmentFallback')});

  return (
    <>
      <div className="cms-admin-toolbar">
        <form className="cms-search" action="/admin/web">
          <label htmlFor="cms-search">{t('searchLabel')}</label>
          <div><input id="cms-search" name="search" defaultValue={search} placeholder={t('searchPlaceholder')} /><button className="admin-button" type="submit">{t('search')}</button>{search && <Link href="/admin/web">{t('reset')}</Link>}</div>
        </form>
        <button className="primary-button" type="button" onClick={newPage}>{t('newPage')}</button>
      </div>

      {!storageConfigured && <p className="cms-storage-warning" role="status">{t('storageWarning')}</p>}
      {listMessage && <p className={isErrorMessage(listMessage) ? 'form-error' : 'admin-success'} role="status">{listMessage}</p>}
      {loading && <p className="admin-count" role="status">{t('loading')}</p>}

      <div className="admin-table-scroll" role="region" aria-label={t('pages')} tabIndex={0}>
        <table className="admin-table cms-page-table">
          <caption>{t('tableCaption')}</caption>
          <thead><tr><th scope="col">{t('title')}</th><th scope="col">{t('category')}</th><th scope="col">{t('status')}</th><th scope="col">{t('modified')}</th><th scope="col">{t('published')}</th><th scope="col">{t('actions')}</th></tr></thead>
          <tbody>{pages.map((page) => <tr key={page.id}><th scope="row"><button className="cms-title-button" type="button" onClick={() => editPage(page)}>{page.title}</button><small>/{page.slug}</small></th><td data-label={t('category')}>{t(`categories.${page.category}`, {}, page.category)}</td><td data-label={t('status')}><span className={`status-pill ${page.status === 'published' ? 'is-open' : 'is-closed'}`}>{page.status === 'published' ? t('published') : t('draft')}</span></td><td data-label={t('modified')}>{formatDate(page.updated_at, formatLocale)}</td><td data-label={t('published')}>{formatDate(page.published_at, formatLocale)}</td><td data-label={t('actions')}><div className="cms-row-actions"><button type="button" onClick={() => editPage(page)}>{t('edit')}</button><Link href={`/admin/web/preview/${page.id}`} target="_blank">{t('preview')}</Link><button type="button" onClick={() => changeStatus(page)}>{page.status === 'published' ? t('unpublish') : t('publish')}</button><button className="is-danger" type="button" onClick={() => setDeleteCandidate({ type: 'page', page })}>{t('delete')}</button></div></td></tr>)}</tbody>
        </table>
        {!pages.length && <div className="cms-empty"><strong>{t('noneFound')}</strong><p>{t('noneHelp')}</p></div>}
      </div>

      <aside className={`admin-detail-panel cms-editor${selected ? ' is-open' : ''}`} aria-hidden={!selected} aria-label={t('editPage')}>
        <div className="admin-detail-header"><div><p className="eyebrow">{selected?.isNew ? t('newPage') : t('website')}</p><h2>{selected?.isNew ? t('createPage') : selected?.title}</h2>{!selected?.isNew && <span className={`admin-save-status is-${displayedSaveState}`} role="status">{t(`saveStates.${displayedSaveState}`)}</span>}</div><button className="admin-button" type="button" onClick={() => setSelected(null)} disabled={busy}>{t('close')}</button></div>
        {selected && <CmsEditorForm page={selected} busy={busy} message={message} storageConfigured={storageConfigured} t={t} formatLocale={formatLocale} onUpdate={update} onTitleChange={(title) => setSelected((current) => ({ ...current, title, slug: slugEdited ? current.slug : createSlug(title) }))} onSlugChange={(value) => { setSlugEdited(true); update('slug', normalizeSlugInput(value)); }} onSave={save} onUploadImage={uploadImage} onUploadAttachments={uploadAttachments} onRenameAttachment={renameAttachment} onMoveAttachment={moveAttachment} onDelete={setDeleteCandidate} />}
      </aside>

      <ConfirmDialog open={Boolean(deleteCandidate)} title={confirmTitle} description={deleteCandidate?.type === 'page' ? t('deletePageDescription') : t('removeDescription')} confirmLabel={deleteCandidate?.type === 'page' ? t('deletePage') : t('remove')} busy={busy} onCancel={() => setDeleteCandidate(null)} onConfirm={confirmDelete} />
    </>
  );
}

function CmsEditorForm({ page, busy, message, storageConfigured, t, formatLocale, onUpdate, onTitleChange, onSlugChange, onSave, onUploadImage, onUploadAttachments, onRenameAttachment, onMoveAttachment, onDelete }) {
  const canUpload = Boolean(storageConfigured && (page.id || (page.title.trim() && isValidCmsSlug(page.slug))));
  return (
    <form className="cms-editor-form" onSubmit={onSave}>
      <fieldset disabled={busy}>
        <legend className="visually-hidden">{t('pageContent')}</legend>
        <label>{t('title')} <span aria-hidden="true">*</span><input value={page.title} maxLength={120} required onChange={(event) => onTitleChange(event.target.value)} /><small>{t('characters', {count: page.title.length, max: 120})}</small></label>
        <label>URL <span aria-hidden="true">*</span><div className="cms-slug-field"><span>/</span><input value={page.slug} maxLength={100} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required onChange={(event) => onSlugChange(event.target.value)} /></div><small>{t('slugHelp')}</small></label>
        <label>{t('category')} <span aria-hidden="true">*</span><select value={page.category} onChange={(event) => onUpdate('category', event.target.value)}>{cmsCategories.map((category) => <option key={category} value={category}>{t(`categories.${category}`, {}, category)}</option>)}</select></label>
        <label>{t('intro')}<textarea value={page.intro || ''} maxLength={500} rows={4} onChange={(event) => onUpdate('intro', event.target.value)} /><small>{t('introHelp', {count: (page.intro || '').length})}</small></label>
        <RichTextEditor key={page.id || 'new'} value={page.body_rich_text} plainText={page.body || ''} onChange={(value) => onUpdate('body_rich_text', value)} disabled={busy} />
      </fieldset>

      <section className="cms-editor-section" aria-labelledby="cms-image-title">
        <div className="admin-section-header"><div><p className="eyebrow">{t('optional')}</p><h3 id="cms-image-title">{t('mainImage')}</h3></div></div>
        {page.image ? <div className="cms-image-preview"><div><Image src={page.image.url} alt={page.image_alt || ''} fill sizes="560px" unoptimized /></div><p>{page.image.original_filename} · {formatFileSize(page.image.size_bytes, formatLocale)}</p><div className="cms-file-actions"><label className="admin-button">{t('changeImage')}<input className="visually-hidden" type="file" accept=".jpg,.jpeg,.png,.webp" onChange={onUploadImage} disabled={busy || !storageConfigured} /></label><button className="admin-button is-danger" type="button" onClick={() => onDelete({ type: 'image', file: page.image })} disabled={busy}>{t('removeImage')}</button></div></div> : <label className={`cms-upload-zone${!canUpload ? ' is-disabled' : ''}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m-4 4 4-4 4 4M5 14v6h14v-6" /></svg><strong>{t('uploadImage')}</strong><span>{t('imageFormats')}</span><input className="visually-hidden" type="file" accept=".jpg,.jpeg,.png,.webp" onChange={onUploadImage} disabled={busy || !canUpload} /></label>}
        {!page.id && <p className="admin-field-note">{t('uploadPrerequisite')}</p>}
        <label>{t('altText')}<input value={page.image_alt || ''} maxLength={300} onChange={(event) => onUpdate('image_alt', event.target.value)} /><small>{t('altHelp')}</small></label>
        <label>{t('imageCaption')}<input value={page.image_caption || ''} maxLength={500} onChange={(event) => onUpdate('image_caption', event.target.value)} /></label>
      </section>

      <section className="cms-editor-section" aria-labelledby="cms-attachments-title">
        <div className="admin-section-header"><div><p className="eyebrow">{t('optional')}</p><h3 id="cms-attachments-title">{t('attachments')}</h3></div><label className={`admin-button${!canUpload ? ' is-disabled' : ''}`}>{t('addFiles')}<input className="visually-hidden" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.jpg,.jpeg,.png,.webp,.gif" onChange={onUploadAttachments} disabled={busy || !canUpload} /></label></div>
        {!page.id && <p className="admin-field-note">{t('uploadPrerequisite')}</p>}
        <ul className="cms-attachment-editor">{page.attachments.map((file, index) => <li key={file.id}><div className="cms-file-meta"><strong>{file.original_filename}</strong><span>{fileTypeLabel(file.mime_type, file.original_filename, t('file'))} · {formatFileSize(file.size_bytes, formatLocale)}</span></div><label>{t('displayName')}<input value={file.title} maxLength={200} onChange={(event) => onUpdate('attachments', page.attachments.map((item) => item.id === file.id ? { ...item, title: event.target.value } : item))} /></label><div className="cms-file-actions"><button className="admin-button" type="button" onClick={() => onRenameAttachment(file)} disabled={busy}>{t('saveName')}</button><button className="admin-button" type="button" onClick={() => onMoveAttachment(index, -1)} disabled={busy || index === 0} aria-label={t('moveUp', {title: file.title})}>{t('up')}</button><button className="admin-button" type="button" onClick={() => onMoveAttachment(index, 1)} disabled={busy || index === page.attachments.length - 1} aria-label={t('moveDown', {title: file.title})}>{t('down')}</button><button className="admin-button is-danger" type="button" onClick={() => onDelete({ type: 'attachment', file })} disabled={busy}>{t('remove')}</button></div></li>)}</ul>
        {!page.attachments.length && <p className="cms-section-empty">{t('noAttachments')}</p>}
      </section>

      {page.id && <dl className="admin-meta"><div><dt>{t('created')}</dt><dd>{formatDate(page.created_at, formatLocale)}</dd></div><div><dt>{t('modified')}</dt><dd>{formatDate(page.updated_at, formatLocale)}</dd></div><div><dt>{t('published')}</dt><dd>{formatDate(page.published_at, formatLocale)}</dd></div></dl>}
      {message && <p className={isErrorMessage(message) ? 'form-error' : 'admin-success'} role="status">{message}</p>}
      <div className="cms-editor-actions"><button className="admin-button" type="submit" value="draft" disabled={busy}>{busy ? t('saving') : t('saveDraft')}</button><button className="primary-button" type="submit" value="published" disabled={busy}>{busy ? t('saving') : t('publish')}</button>{page.id && <Link className="admin-button" href={`/admin/web/preview/${page.id}`} target="_blank">{t('preview')}</Link>}</div>
    </form>
  );
}
