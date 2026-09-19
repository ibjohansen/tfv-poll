import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/admin-access';
import { adminPermissions, isAllowedMatrikkelSync, isAuthConfigured } from '@/lib/admin-policy';
import MapExplorer from '@/components/MapExplorer/MapExplorer';
import { adminPageMetadata } from '@/lib/page-metadata';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const generateMetadata = () => adminPageMetadata('map');

export default async function MapExplorerPage() {
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await getAdminSession();
  if (!adminPermissions(session?.user).has('members')) redirect('/admin');
  return <section className="admin-content"><MapExplorer canMatrikkelSync={isAllowedMatrikkelSync(session.user)} /></section>;
}
