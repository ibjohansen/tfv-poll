import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { isAllowedAdmin, isAllowedMatrikkelSync, isAuthConfigured } from '@/lib/admin-policy';
import { getAdminMatrikkelTasks, getAdminMemberRequests } from '@/lib/member-self-service';
import AdminMemberRequests from '@/components/AdminMemberRequests';
import AdminMatrikkelTasks from '@/components/AdminMatrikkelTasks';
import AdminModuleHeader from '@/components/AdminModuleHeader';
import { getServerI18n } from '@/lib/i18n/server';
import { adminPageMetadata } from '@/lib/page-metadata';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const generateMetadata = () => adminPageMetadata('inbox');

export default async function AdminInboxPage() {
  const { t } = await getServerI18n();
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await auth();
  if (!isAllowedAdmin(session?.user)) redirect('/admin/login');
  let requests;
  let matrikkelTasks;
  try { [requests, matrikkelTasks] = await Promise.all([getAdminMemberRequests(), getAdminMatrikkelTasks()]); } catch { requests = null; matrikkelTasks = null; }
  const taskCount = requests && matrikkelTasks ? requests.length + matrikkelTasks.length : undefined;
  return <main className="admin-shell"><AdminModuleHeader active="inbox" title={t('admin.common.inbox')} email={session.user.email} pendingTaskCount={taskCount} /><section className="admin-content">{requests && matrikkelTasks ? <><AdminMatrikkelTasks tasks={matrikkelTasks} canManage={isAllowedMatrikkelSync(session.user)} /><AdminMemberRequests initialRequests={requests} showEmpty={!matrikkelTasks.length} /></> : <p className="form-error" role="alert">{t('admin.pages.inboxUnavailable')}</p>}</section></main>;
}
