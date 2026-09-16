import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { adminPermissions, isAllowedMatrikkelSync, isAuthConfigured } from '@/lib/admin-policy';
import AdminModuleHeader from '@/components/AdminModuleHeader';
import MapExplorer from '@/components/MapExplorer/MapExplorer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function MapExplorerPage() {
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await auth();
  if (!adminPermissions(session?.user).has('members')) redirect('/admin');
  return <main className="admin-shell"><AdminModuleHeader active="map" title="Kart og registerkontroll" email={session.user.email} />
    <section className="admin-content"><MapExplorer canMatrikkelSync={isAllowedMatrikkelSync(session.user)} /></section></main>;
}
