import { notFound, redirect } from 'next/navigation';
import CmsPageEditor from '@/components/CmsPageEditor';
import { getAdminSession } from '@/lib/admin-access';
import { isAllowedAdmin, isAuthConfigured } from '@/lib/admin-policy';
import { getAdminCmsPage } from '@/lib/cms-pages';
import { isCmsStorageConfigured } from '@/lib/cms-storage';
import { adminPageMetadata } from '@/lib/page-metadata';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const generateMetadata = () => adminPageMetadata('web');

export default async function CmsEditorPage({ params, searchParams }) {
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await getAdminSession();
  if (!isAllowedAdmin(session?.user)) redirect('/admin/login');
  const { id } = await params;
  const requestedReturn = String((await searchParams).return || '/admin/web');
  const returnPath = requestedReturn.startsWith('/admin/web') && !requestedReturn.startsWith('//') ? requestedReturn : '/admin/web';
  const page = id === 'new' ? null : await getAdminCmsPage(id, { includeArchived: true }).catch(() => null);
  if (id !== 'new' && !page) notFound();
  return <section className="admin-content"><CmsPageEditor initialPage={page} returnPath={returnPath} storageConfigured={isCmsStorageConfigured()} /></section>;
}
