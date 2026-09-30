import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/admin-access';
import { adminPermissions, isAuthConfigured } from '@/lib/admin-policy';
import ActivityMapEditor from '@/components/ActivityMap/ActivityMapEditor';
import { adminPageMetadata } from '@/lib/page-metadata';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const generateMetadata = () => adminPageMetadata('activityMap');

export default async function ActivityMapAdminPage() {
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await getAdminSession();
  if (!adminPermissions(session?.user).has('members')) redirect('/admin');
  return <section className="admin-content"><ActivityMapEditor /></section>;
}
