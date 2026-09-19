'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import ConfirmDialog from '@/components/ConfirmDialog';
import { cmsCategories } from '@/lib/cms-validation';

function formatDate(value, locale) {
  return value ? new Date(value).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export default function CmsPageDirectory({ pages, filters, storageConfigured }) {
  const { t, formatLocale } = useI18n('cms.admin');
  const router = useRouter();
  const [rows, setRows] = useState(pages);
  const [candidate, setCandidate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
  const returnPath = `/admin/web${query ? `?${query}` : ''}`;

  async function archiveOrRestore() {
    setBusy(true);
    try {
      const status = candidate.deleted_at ? 'restore' : 'archived';
      const response = await fetch(`/api/admin/cms/pages/${candidate.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, expectedVersion: candidate.version }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setRows((current) => filters.status === 'archived' ? current.filter(({ id }) => id !== candidate.id) : current.filter(({ id }) => id !== candidate.id));
      setMessage(status === 'restore' ? 'Siden er gjenopprettet.' : 'Siden er arkivert og kan gjenopprettes.');
    } catch (error) { setMessage(error.message || t('statusError')); }
    finally { setBusy(false); setCandidate(null); }
  }

  async function copy(page) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/cms/pages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'copy', sourceId: page.id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      router.push(`/admin/web/${body.page.id}?return=${encodeURIComponent(returnPath)}`);
    } catch (error) { setMessage(error.message || t('saveError')); setBusy(false); }
  }

  return <>
    <form className="cms-admin-toolbar cms-directory-filters" action="/admin/web">
      <label>{t('searchLabel')}<input name="search" type="search" defaultValue={filters.search} placeholder={t('searchPlaceholder')} /></label>
      <label>Status<select name="status" defaultValue={filters.status}><option value="active">Aktive</option><option value="draft">Utkast</option><option value="published">Publiserte</option><option value="archived">Arkiverte</option></select></label>
      <label>{t('category')}<select name="category" defaultValue={filters.category}><option value="">Alle</option>{cmsCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
      <label>Sortering<select name="sort" defaultValue={filters.sort}><option value="updated-desc">Sist endret</option><option value="updated-asc">Eldst endret</option><option value="title-asc">Tittel A–Å</option><option value="title-desc">Tittel Å–A</option></select></label>
      <button className="admin-button" type="submit">{t('search')}</button>
      <Link className="primary-button" href={`/admin/web/new?return=${encodeURIComponent(returnPath)}`}>{t('newPage')}</Link>
    </form>
    {!storageConfigured && <p className="cms-storage-warning" role="status">{t('storageWarning')}</p>}
    {message && <p className="admin-success" role="status">{message}</p>}
    <div className="admin-table-scroll" role="region" aria-label={t('pages')} tabIndex={0}>
      <table className="admin-table cms-page-table"><caption>{t('tableCaption')}</caption><thead><tr><th>{t('title')}</th><th>{t('category')}</th><th>{t('status')}</th><th>{t('modified')}</th><th>{t('actions')}</th></tr></thead>
        <tbody>{rows.map((page) => <tr key={page.id}><th scope="row"><Link className="cms-title-button" href={`/admin/web/${page.id}?return=${encodeURIComponent(returnPath)}`}>{page.title}</Link><small>/{page.slug}{page.has_unpublished_changes ? ' · upubliserte endringer' : ''}</small></th><td data-label={t('category')}>{page.category}</td><td data-label={t('status')}><span className={`status-pill ${page.status === 'published' ? 'is-open' : 'is-closed'}`}>{page.deleted_at ? 'Arkivert' : page.status === 'published' ? t('published') : t('draft')}</span></td><td data-label={t('modified')}>{formatDate(page.updated_at, formatLocale)}</td><td data-label={t('actions')}><div className="cms-row-actions"><Link href={`/admin/web/${page.id}?return=${encodeURIComponent(returnPath)}`}>{t('edit')}</Link><Link href={`/admin/web/preview/${page.id}`} target="_blank">{t('preview')}</Link>{!page.deleted_at && <button type="button" disabled={busy} onClick={() => copy(page)}>{t('copy')}</button>}<button className="is-danger" type="button" disabled={busy} onClick={() => setCandidate(page)}>{page.deleted_at ? 'Gjenopprett' : 'Arkiver'}</button></div></td></tr>)}</tbody>
      </table>
      {!rows.length && <div className="cms-empty"><strong>{t('noneFound')}</strong><p>{t('noneHelp')}</p></div>}
    </div>
    <ConfirmDialog open={Boolean(candidate)} title={candidate?.deleted_at ? `Gjenopprett «${candidate?.title}»?` : `Arkiver «${candidate?.title}»?`} description={candidate?.deleted_at ? 'Siden legges tilbake som utkast.' : 'Siden forsvinner offentlig, men innhold, filer og historikk beholdes.'} confirmLabel={candidate?.deleted_at ? 'Gjenopprett' : 'Arkiver'} busy={busy} onCancel={() => setCandidate(null)} onConfirm={archiveOrRestore} />
  </>;
}
