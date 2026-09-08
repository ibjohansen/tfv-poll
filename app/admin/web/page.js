import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { isAllowedAdmin, isAuthConfigured } from '@/lib/admin-policy';
import AdminModuleHeader from '@/components/AdminModuleHeader';
import CmsPageDirectory from '@/components/CmsPageDirectory';
import { getAdminCmsPages } from '@/lib/cms-pages';
import { isCmsStorageConfigured } from '@/lib/cms-storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AdminWebPage({ searchParams }) {
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await auth();
  if (!isAllowedAdmin(session?.user)) redirect('/admin/login');
  const search = String((await searchParams).search || '').slice(0, 120);
  let pages;
  try { pages = await getAdminCmsPages(search); } catch { pages = null; }
  return <main className="admin-shell"><AdminModuleHeader active="web" title="Nettsider" email={session.user.email} /><section className="admin-content">{pages ? <CmsPageDirectory pages={pages} search={search} storageConfigured={isCmsStorageConfigured()} /> : <p className="form-error" role="alert">CMS-et er midlertidig utilgjengelig. Kontroller at databaseskjemaet er oppdatert.</p>}</section></main>;
}
