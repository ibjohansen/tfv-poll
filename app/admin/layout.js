import SiteHeader from '@/components/SiteHeader';
import AdminButtonTooltips from '@/components/AdminButtonTooltips';
import AdminLayoutShell from '@/components/AdminLayoutShell';
import AdminModuleHeader from '@/components/AdminModuleHeader';
import RequestLocaleProvider from '@/components/RequestLocaleProvider';
import { getAdminSession } from '@/lib/admin-access';
import { adminPermissions, isAllowedAdmin, isAllowedMatrikkelSync } from '@/lib/admin-policy';
import { getAdminTaskCount } from '@/lib/member-self-service';

function visibleAdminModules(user) {
  const permissions = adminPermissions(user);
  const keys = ['overview'];
  if (permissions.has('members')) keys.push('inbox', 'members', 'map', 'newsletters');
  if (isAllowedMatrikkelSync(user)) keys.push('matrikkel');
  if (permissions.has('surveys')) keys.push('surveys');
  if (permissions.has('cms')) keys.push('web');
  if (permissions.has('audit')) keys.push('usage', 'audit');
  return keys;
}

export default async function AdminLayout({ children }) {
  const session = await getAdminSession();
  const user = isAllowedAdmin(session?.user) ? session.user : null;
  let taskCount = 0;
  if (user && adminPermissions(user).has('members')) {
    try { taskCount = await getAdminTaskCount(); } catch { /* Keep navigation available when the count cannot be loaded. */ }
  }
  return (
    <RequestLocaleProvider><div className="admin-layout">
      <AdminButtonTooltips />
      <SiteHeader />
      {user ? <AdminLayoutShell chrome={<AdminModuleHeader email={user.email} pendingTaskCount={taskCount} visibleKeys={visibleAdminModules(user)} />}>{children}</AdminLayoutShell> : children}
    </div></RequestLocaleProvider>
  );
}
