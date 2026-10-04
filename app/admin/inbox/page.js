import { redirect } from 'next/navigation';
import { adminPermissions, isAllowedAdmin, isAllowedMatrikkelSync, isAuthConfigured } from '@/lib/admin-policy';
import { getAdminSession } from '@/lib/admin-access';
import { getAdminActivityMapTasks, getAdminMatrikkelTasks, getAdminMemberRequests } from '@/lib/member-self-service';
import AdminMemberRequests from '@/components/AdminMemberRequests';
import AdminMatrikkelTasks from '@/components/AdminMatrikkelTasks';
import AdminActivityMapTasks from '@/components/AdminActivityMapTasks';
import { getServerI18n } from '@/lib/i18n/server';
import { adminPageMetadata } from '@/lib/page-metadata';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const generateMetadata = () => adminPageMetadata('inbox');

export default async function AdminInboxPage() {
  const { t } = await getServerI18n();
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await getAdminSession();
  if (!isAllowedAdmin(session?.user)) redirect('/admin/login');
  let requests;
  let matrikkelTasks;
  let activityMapTasks;
  try {
    [requests, matrikkelTasks, activityMapTasks] = await Promise.all([
      getAdminMemberRequests(), getAdminMatrikkelTasks(), getAdminActivityMapTasks(),
    ]);
  } catch { requests = null; matrikkelTasks = null; activityMapTasks = null; }
  const canManageActivityMap = adminPermissions(session.user).has('members');
  return <section className="admin-content">{requests && matrikkelTasks && activityMapTasks
    ? <><AdminActivityMapTasks tasks={activityMapTasks} canManage={canManageActivityMap} />
      <AdminMatrikkelTasks tasks={matrikkelTasks} canManage={isAllowedMatrikkelSync(session.user)} />
      <AdminMemberRequests initialRequests={requests} showEmpty={!matrikkelTasks.length && !activityMapTasks.length} /></>
    : <p className="form-error" role="alert">{t('admin.pages.inboxUnavailable')}</p>}</section>;
}
