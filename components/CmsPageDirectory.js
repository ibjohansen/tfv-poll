'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { cmsCategories, createSlug, isValidCmsSlug, normalizeSlugInput } from '@/lib/cms-validation';
import { fileTypeLabel, formatFileSize } from '@/lib/file-format';

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

function formatDate(value) {
  return value ? new Date(value).toLocaleString('nb-NO', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function isErrorMessage(message) {
  return /kunne|må |ikke|feil|større|støttes/i.test(message);
}

function pagePayload(page, status) {
  return {
    title: page.title,
    slug: page.slug,
    intro: page.intro || '',
    body: page.body || '',
    category: page.category,
    imageAlt: page.image_alt || '',
    imageCaption: page.image_caption || '',
    status,
  };
}

export default function CmsPageDirectory({ pages, search, storageConfigured }) {
  const router = useRouter();
  const [selected, setSelected] = useState(null);
  const [slugEdited, setSlugEdited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
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
  }

  async function editPage(summary) {
    setLoading(true);
    setMessage('');
    setListMessage('');
    try {
      const response = await fetch(`/api/admin/cms/pages/${summary.id}`);
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || 'Kunne ikke hente siden.');
      setSelected(body.page);
      setSlugEdited(true);
    } catch (error) {
      setListMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function save(event) {
    event.preventDefault();
    const requestedStatus = event.nativeEvent.submitter?.value === 'published' ? 'published' : 'draft';
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(selected.isNew ? '/api/admin/cms/pages' : `/api/admin/cms/pages/${selected.id}`, {
        method: selected.isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pagePayload(selected, requestedStatus)),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || 'Kunne ikke lagre siden.');
      setSelected(body.page);
      setSlugEdited(true);
      setMessage(requestedStatus === 'published' ? 'Siden er lagret og publisert.' : 'Utkastet er lagret.');
      router.refresh();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function ensureDraftForUpload() {
    if (selected?.id) return { page: selected, created: false };
    if (!selected?.title?.trim() || !isValidCmsSlug(selected?.slug)) {
      throw new Error('Fyll ut en gyldig tittel og URL før du legger til filer.');
    }
    const response = await fetch('/api/admin/cms/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pagePayload(selected, 'draft')),
    });
    const body = await response.json();
    if (!response.ok || !body.ok) throw new Error(body.message || 'Kunne ikke opprette utkastet før filopplasting.');
    setSelected(body.page);
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
      if (!response.ok || !body.ok) throw new Error(body.message || 'Kunne ikke endre status.');
      setListMessage(status === 'published' ? 'Siden er publisert.' : 'Siden er avpublisert og lagret som utkast.');
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
      if (!response.ok || !body.ok) throw new Error(body.message || 'Kunne ikke laste opp bildet.');
      setSelected((current) => ({ ...(current?.id === persisted.page.id ? current : persisted.page), image: body.image }));
      setMessage(`${createdDraft ? 'Utkastet ble opprettet. ' : ''}Bildet er lastet opp. Husk alt-tekst og lagre siden.`);
      router.refresh();
    } catch (error) {
      setMessage(`${createdDraft ? 'Utkastet ble opprettet, men ' : ''}${error.message}`);
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
        if (!response.ok || !body.ok) throw new Error(body.message || `Kunne ikke laste opp ${file.name}.`);
        uploaded.push(body.attachment);
      }
      setSelected((current) => {
        const page = current?.id === persisted.page.id ? current : persisted.page;
        return { ...page, attachments: [...page.attachments, ...uploaded] };
      });
      setMessage(`${createdDraft ? 'Utkastet ble opprettet. ' : ''}${uploaded.length} vedlegg lastet opp.`);
      router.refresh();
    } catch (error) {
      if (uploaded.length && persistedPage) {
        setSelected((current) => {
          const page = current?.id === persistedPage.id ? current : persistedPage;
          return { ...page, attachments: [...page.attachments, ...uploaded] };
        });
        router.refresh();
      }
      const partial = uploaded.length ? `${uploaded.length} vedlegg ble lastet opp, men resten mislyktes. ` : '';
      setMessage(`${createdDraft ? 'Utkastet ble opprettet. ' : ''}${partial}${error.message}`);
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
      if (!response.ok || !body.ok) throw new Error(body.message || 'Kunne ikke endre navnet.');
      setMessage('Visningsnavnet er lagret.');
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
      if (!response.ok || !body.ok) throw new Error(body.message || 'Kunne ikke endre rekkefølgen.');
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
        if (!response.ok || !body.ok) throw new Error(body.message || 'Kunne ikke slette siden.');
        if (selected?.id === candidate.page.id) setSelected(null);
        setListMessage('Siden er slettet.');
      } else if (candidate.type === 'image') {
        const response = await fetch(`/api/admin/cms/pages/${selected.id}/image`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageId: candidate.file.id }),
        });
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.message || 'Kunne ikke fjerne bildet.');
        update('image', null);
        setMessage('Bildet er fjernet.');
      } else {
        const response = await fetch(`/api/admin/cms/pages/${selected.id}/attachments/${candidate.file.id}`, { method: 'DELETE' });
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.message || 'Kunne ikke fjerne vedlegget.');
        setSelected((current) => ({ ...current, attachments: current.attachments.filter(({ id }) => id !== candidate.file.id) }));
        setMessage('Vedlegget er fjernet.');
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
    ? `Slette «${deleteCandidate.page.title}»?`
    : deleteCandidate?.type === 'image'
      ? 'Fjerne hovedbildet?'
      : `Fjerne «${deleteCandidate?.file?.title || 'vedlegget'}»?`;

  return (
    <>
      <div className="cms-admin-toolbar">
        <form className="cms-search" action="/admin/web">
          <label htmlFor="cms-search">Søk på tittel</label>
          <div><input id="cms-search" name="search" defaultValue={search} placeholder="Søk etter en side …" /><button className="admin-button" type="submit">Søk</button>{search && <Link href="/admin/web">Nullstill</Link>}</div>
        </form>
        <button className="primary-button" type="button" onClick={newPage}>Ny side</button>
      </div>

      {!storageConfigured && <p className="cms-storage-warning" role="status">Tekstinnhold kan opprettes, men bilde- og filopplasting krever at Neon Object Storage er satt opp.</p>}
      {listMessage && <p className={isErrorMessage(listMessage) ? 'form-error' : 'admin-success'} role="status">{listMessage}</p>}
      {loading && <p className="admin-count" role="status">Henter side …</p>}

      <div className="admin-table-scroll" role="region" aria-label="Nettsider" tabIndex={0}>
        <table className="admin-table cms-page-table">
          <caption>Alle aktive nettsider. Bruk handlingene for å redigere, forhåndsvise eller endre publiseringsstatus.</caption>
          <thead><tr><th scope="col">Tittel</th><th scope="col">Kategori</th><th scope="col">Status</th><th scope="col">Sist endret</th><th scope="col">Publisert</th><th scope="col">Handlinger</th></tr></thead>
          <tbody>{pages.map((page) => <tr key={page.id}><th scope="row"><button className="cms-title-button" type="button" onClick={() => editPage(page)}>{page.title}</button><small>/{page.slug}</small></th><td>{page.category}</td><td><span className={`status-pill ${page.status === 'published' ? 'is-open' : 'is-closed'}`}>{page.status === 'published' ? 'Publisert' : 'Utkast'}</span></td><td>{formatDate(page.updated_at)}</td><td>{formatDate(page.published_at)}</td><td><div className="cms-row-actions"><button type="button" onClick={() => editPage(page)}>Rediger</button><Link href={`/admin/web/preview/${page.id}`} target="_blank">Forhåndsvis</Link><button type="button" onClick={() => changeStatus(page)}>{page.status === 'published' ? 'Avpubliser' : 'Publiser'}</button><button className="is-danger" type="button" onClick={() => setDeleteCandidate({ type: 'page', page })}>Slett</button></div></td></tr>)}</tbody>
        </table>
        {!pages.length && <div className="cms-empty"><strong>Ingen sider funnet</strong><p>Opprett den første informasjonssiden, eller prøv et annet søk.</p></div>}
      </div>

      <aside className={`admin-detail-panel cms-editor${selected ? ' is-open' : ''}`} aria-hidden={!selected} aria-label="Rediger nettside">
        <div className="admin-detail-header"><div><p className="eyebrow">{selected?.isNew ? 'Ny side' : 'Nettside'}</p><h2>{selected?.isNew ? 'Opprett side' : selected?.title}</h2></div><button className="admin-button" type="button" onClick={() => setSelected(null)}>Lukk</button></div>
        {selected && <CmsEditorForm page={selected} busy={busy} message={message} storageConfigured={storageConfigured} onUpdate={update} onTitleChange={(title) => setSelected((current) => ({ ...current, title, slug: slugEdited ? current.slug : createSlug(title) }))} onSlugChange={(value) => { setSlugEdited(true); update('slug', normalizeSlugInput(value)); }} onSave={save} onUploadImage={uploadImage} onUploadAttachments={uploadAttachments} onRenameAttachment={renameAttachment} onMoveAttachment={moveAttachment} onDelete={setDeleteCandidate} />}
      </aside>

      <ConfirmDialog open={Boolean(deleteCandidate)} title={confirmTitle} description={deleteCandidate?.type === 'page' ? 'Siden skjules umiddelbart, men innhold og filer beholdes i databasen.' : 'Elementet fjernes fra siden, men beholdes som slettet i systemet.'} confirmLabel={deleteCandidate?.type === 'page' ? 'Slett side' : 'Fjern'} busy={busy} onCancel={() => setDeleteCandidate(null)} onConfirm={confirmDelete} />
    </>
  );
}

function CmsEditorForm({ page, busy, message, storageConfigured, onUpdate, onTitleChange, onSlugChange, onSave, onUploadImage, onUploadAttachments, onRenameAttachment, onMoveAttachment, onDelete }) {
  const canUpload = Boolean(storageConfigured && (page.id || (page.title.trim() && isValidCmsSlug(page.slug))));
  return (
    <form className="cms-editor-form" onSubmit={onSave}>
      <fieldset disabled={busy}>
        <legend className="visually-hidden">Sideinnhold</legend>
        <label>Tittel <span aria-hidden="true">*</span><input value={page.title} maxLength={120} required onChange={(event) => onTitleChange(event.target.value)} /><small>{page.title.length}/120 tegn</small></label>
        <label>URL <span aria-hidden="true">*</span><div className="cms-slug-field"><span>/</span><input value={page.slug} maxLength={100} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required onChange={(event) => onSlugChange(event.target.value)} /></div><small>Foreslås fra tittelen. Bruk små bokstaver, tall og bindestrek.</small></label>
        <label>Kategori <span aria-hidden="true">*</span><select value={page.category} onChange={(event) => onUpdate('category', event.target.value)}>{cmsCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label>Ingress<textarea value={page.intro || ''} maxLength={500} rows={4} onChange={(event) => onUpdate('intro', event.target.value)} /><small>{(page.intro || '').length}/500 tegn. Kort introduksjon anbefales.</small></label>
        <label>Hovedtekst<textarea value={page.body || ''} maxLength={100000} rows={12} onChange={(event) => onUpdate('body', event.target.value)} /><small>Vanlige linjeskift blir avsnitt. HTML og Markdown brukes ikke.</small></label>
      </fieldset>

      <section className="cms-editor-section" aria-labelledby="cms-image-title">
        <div className="admin-section-header"><div><p className="eyebrow">Valgfritt</p><h3 id="cms-image-title">Hovedbilde</h3></div></div>
        {page.image ? <div className="cms-image-preview"><div><Image src={page.image.url} alt={page.image_alt || ''} fill sizes="560px" unoptimized /></div><p>{page.image.original_filename} · {formatFileSize(page.image.size_bytes)}</p><div className="cms-file-actions"><label className="admin-button">Bytt bilde<input className="visually-hidden" type="file" accept=".jpg,.jpeg,.png,.webp" onChange={onUploadImage} disabled={busy || !storageConfigured} /></label><button className="admin-button is-danger" type="button" onClick={() => onDelete({ type: 'image', file: page.image })} disabled={busy}>Fjern bilde</button></div></div> : <label className={`cms-upload-zone${!canUpload ? ' is-disabled' : ''}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m-4 4 4-4 4 4M5 14v6h14v-6" /></svg><strong>Last opp hovedbilde</strong><span>JPG, PNG eller WebP · maks 10 MB</span><input className="visually-hidden" type="file" accept=".jpg,.jpeg,.png,.webp" onChange={onUploadImage} disabled={busy || !canUpload} /></label>}
        {!page.id && <p className="admin-field-note">Fyll ut tittel og URL. Første opplasting oppretter automatisk et utkast.</p>}
        <label>Alt-tekst<input value={page.image_alt || ''} maxLength={300} onChange={(event) => onUpdate('image_alt', event.target.value)} /><small>Beskriv motivet kort for brukere som ikke kan se bildet. Anbefales når bildet formidler informasjon.</small></label>
        <label>Bildetekst<input value={page.image_caption || ''} maxLength={500} onChange={(event) => onUpdate('image_caption', event.target.value)} /></label>
      </section>

      <section className="cms-editor-section" aria-labelledby="cms-attachments-title">
        <div className="admin-section-header"><div><p className="eyebrow">Valgfritt</p><h3 id="cms-attachments-title">Vedlegg</h3></div><label className={`admin-button${!canUpload ? ' is-disabled' : ''}`}>Legg til filer<input className="visually-hidden" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.jpg,.jpeg,.png,.webp,.gif" onChange={onUploadAttachments} disabled={busy || !canUpload} /></label></div>
        {!page.id && <p className="admin-field-note">Fyll ut tittel og URL. Første opplasting oppretter automatisk et utkast.</p>}
        <ul className="cms-attachment-editor">{page.attachments.map((file, index) => <li key={file.id}><div className="cms-file-meta"><strong>{file.original_filename}</strong><span>{fileTypeLabel(file.mime_type, file.original_filename)} · {formatFileSize(file.size_bytes)}</span></div><label>Visningsnavn<input value={file.title} maxLength={200} onChange={(event) => onUpdate('attachments', page.attachments.map((item) => item.id === file.id ? { ...item, title: event.target.value } : item))} /></label><div className="cms-file-actions"><button className="admin-button" type="button" onClick={() => onRenameAttachment(file)} disabled={busy}>Lagre navn</button><button className="admin-button" type="button" onClick={() => onMoveAttachment(index, -1)} disabled={busy || index === 0} aria-label={`Flytt ${file.title} opp`}>Opp</button><button className="admin-button" type="button" onClick={() => onMoveAttachment(index, 1)} disabled={busy || index === page.attachments.length - 1} aria-label={`Flytt ${file.title} ned`}>Ned</button><button className="admin-button is-danger" type="button" onClick={() => onDelete({ type: 'attachment', file })} disabled={busy}>Fjern</button></div></li>)}</ul>
        {!page.attachments.length && <p className="cms-section-empty">Ingen vedlegg er lagt til.</p>}
      </section>

      {page.id && <dl className="admin-meta"><div><dt>Opprettet</dt><dd>{formatDate(page.created_at)}</dd></div><div><dt>Sist endret</dt><dd>{formatDate(page.updated_at)}</dd></div><div><dt>Publisert</dt><dd>{formatDate(page.published_at)}</dd></div></dl>}
      {message && <p className={isErrorMessage(message) ? 'form-error' : 'admin-success'} role="status">{message}</p>}
      <div className="cms-editor-actions"><button className="admin-button" type="submit" value="draft" disabled={busy}>{busy ? 'Lagrer …' : 'Lagre utkast'}</button><button className="primary-button" type="submit" value="published" disabled={busy}>{busy ? 'Lagrer …' : 'Publiser'}</button>{page.id && <Link className="admin-button" href={`/admin/web/preview/${page.id}`} target="_blank">Forhåndsvis</Link>}</div>
    </form>
  );
}
