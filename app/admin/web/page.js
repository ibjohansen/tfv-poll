import { redirect } from 'next/navigation';
import { isAllowedAdmin, isAuthConfigured } from '@/lib/admin-policy';
import { getAdminSession } from '@/lib/admin-access';
import AdminModuleHeader from '@/components/AdminModuleHeader';
import CmsPageDirectory from '@/components/CmsPageDirectory';
import { getAdminCmsPages } from '@/lib/cms-pages';
import { isCmsStorageConfigured } from '@/lib/cms-storage';
import { getServerI18n } from '@/lib/i18n/server';
import { adminPageMetadata } from '@/lib/page-metadata';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const generateMetadata = () => adminPageMetadata('web');

export default async function AdminWebPage({ searchParams }) {
  const { t } = await getServerI18n();
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await getAdminSession();
  if (!isAllowedAdmin(session?.user)) redirect('/admin/login');
  const raw = await searchParams;
  const filters = {
    search: String(raw.search || '').slice(0, 120),
    status: ['active', 'draft', 'published', 'archived'].includes(raw.status) ? raw.status : 'active',
    category: String(raw.category || ''),
    sort: ['updated-desc', 'updated-asc', 'title-asc', 'title-desc'].includes(raw.sort) ? raw.sort : 'updated-desc',
  };
  let pages;
  try { pages = await getAdminCmsPages(filters); } catch { pages = null; }
  return <main className="admin-shell"><AdminModuleHeader active="web" title={t('admin.pages.websites')} email={session.user.email} /><section className="admin-content">{pages ? <CmsPageDirectory key={JSON.stringify(filters)} pages={pages} filters={filters} storageConfigured={isCmsStorageConfigured()} /> : <p className="form-error" role="alert">{t('admin.pages.cmsUnavailable')}</p>}</section></main>;
}
