import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/admin-access';
import { adminPermissions, isAllowedMatrikkelSync, isAuthConfigured } from '@/lib/admin-policy';
import AdminModuleHeader from '@/components/AdminModuleHeader';
import MapExplorer from '@/components/MapExplorer/MapExplorer';
import { getServerI18n } from '@/lib/i18n/server';
import { adminPageMetadata } from '@/lib/page-metadata';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const generateMetadata = () => adminPageMetadata('map');

export default async function MapExplorerPage() {
  const { t } = await getServerI18n('admin.common');
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await getAdminSession();
  if (!adminPermissions(session?.user).has('members')) redirect('/admin');
  return <main className="admin-shell"><AdminModuleHeader active="map" title={t('map')} email={session.user.email} />
    <section className="admin-content"><MapExplorer canMatrikkelSync={isAllowedMatrikkelSync(session.user)} /></section></main>;
}
