'use client';

import { useApiClient } from '@/components/useApiClient';

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
  const apiFetch = useApiClient();
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
      const response = await apiFetch(`/api/admin/cms/pages/${candidate.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, expectedVersion: candidate.version }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setRows((current) => current.filter(({ id }) => id !== candidate.id));
      setMessage(status === 'restore' ? t('restoredNotice') : t('archivedNotice'));
    } catch (error) { setMessage(error.message || t('statusError')); }
    finally { setBusy(false); setCandidate(null); }
  }

  async function copy(page) {
    setBusy(true); setMessage('');
    try {
      const response = await apiFetch('/api/admin/cms/pages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'copy', sourceId: page.id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      router.push(`/admin/web/${body.page.id}?return=${encodeURIComponent(returnPath)}`);
    } catch (error) { setMessage(error.message || t('saveError')); setBusy(false); }
  }

  return <>
    <form className="cms-admin-toolbar cms-directory-filters" action="/admin/web">
      <label>{t('searchLabel')}<input name="search" type="search" defaultValue={filters.search} placeholder={t('searchPlaceholder')} /></label>
      <label>{t('status')}<select name="status" defaultValue={filters.status}><option value="active">{t('active')}</option><option value="draft">{t('drafts')}</option><option value="published">{t('publishedPages')}</option><option value="archived">{t('archivedPages')}</option></select></label>
      <label>{t('category')}<select name="category" defaultValue={filters.category}><option value="">{t('all')}</option>{cmsCategories.map((category) => <option key={category} value={category}>{t(`categories.${category}`)}</option>)}</select></label>
      <label>{t('sort')}<select name="sort" defaultValue={filters.sort}><option value="updated-desc">{t('modified')}</option><option value="updated-asc">{t('oldestModified')}</option><option value="title-asc">{t('titleAsc')}</option><option value="title-desc">{t('titleDesc')}</option></select></label>
      <button className="admin-button" type="submit">{t('search')}</button>
      <Link className="primary-button" href={`/admin/web/new?return=${encodeURIComponent(returnPath)}`}>{t('newPage')}</Link>
    </form>
    {!storageConfigured && <p className="cms-storage-warning" role="status">{t('storageWarning')}</p>}
    {message && <p className="admin-success" role="status">{message}</p>}
    <div className="admin-table-scroll" role="region" aria-label={t('pages')} tabIndex={0}>
      <table className="admin-table cms-page-table"><caption>{t('tableCaption')}</caption><thead><tr><th>{t('title')}</th><th>{t('category')}</th><th>{t('status')}</th><th>{t('modified')}</th><th>{t('actions')}</th></tr></thead>
        <tbody>{rows.map((page) => <tr key={page.id}><th scope="row"><Link className="cms-title-button" href={`/admin/web/${page.id}?return=${encodeURIComponent(returnPath)}`}>{page.title}</Link><small>/{page.slug}{page.has_unpublished_changes ? ` · ${t('unpublishedChanges')}` : ''}</small></th><td data-label={t('category')}>{t(`categories.${page.category}`)}</td><td data-label={t('status')}><span className={`status-pill ${page.status === 'published' ? 'is-open' : 'is-closed'}`}>{page.deleted_at ? t('archived') : page.status === 'published' ? t('published') : t('draft')}</span></td><td data-label={t('modified')}>{formatDate(page.updated_at, formatLocale)}</td><td data-label={t('actions')}><div className="cms-row-actions"><Link href={`/admin/web/${page.id}?return=${encodeURIComponent(returnPath)}`}>{t('edit')}</Link><Link href={`/admin/web/preview/${page.id}`} target="_blank">{t('preview')}</Link>{!page.deleted_at && <button type="button" disabled={busy} onClick={() => copy(page)}>{t('copy')}</button>}<button className="is-danger" type="button" disabled={busy} onClick={() => setCandidate(page)}>{page.deleted_at ? t('restore') : t('archive')}</button></div></td></tr>)}</tbody>
      </table>
      {!rows.length && <div className="cms-empty"><strong>{t('noneFound')}</strong><p>{t('noneHelp')}</p></div>}
    </div>
    <ConfirmDialog open={Boolean(candidate)} title={candidate?.deleted_at ? t('restorePageConfirm', { title: candidate?.title }) : t('archivePageConfirm', { title: candidate?.title })} description={candidate?.deleted_at ? t('restorePageHelp') : t('archivePageHelp')} confirmLabel={candidate?.deleted_at ? t('restore') : t('archive')} busy={busy} onCancel={() => setCandidate(null)} onConfirm={archiveOrRestore} />
  </>;
}
