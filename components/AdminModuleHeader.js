import { signOut } from '@/auth';
import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';
import AdminNavigation, { AdminRouteHeading } from '@/components/AdminNavigation';
import { getAdminTaskCount } from '@/lib/member-self-service';
import { getServerI18n } from '@/lib/i18n/server';

function LogoutButton({ label }) {
  return <form action={async () => { 'use server'; await signOut({ redirectTo: '/admin/login' }); }}><button type="submit" className="admin-button">{label}</button></form>;
}

export default async function AdminModuleHeader({ email, pendingTaskCount, visibleKeys }) {
  const { t } = await getServerI18n();
  const initial = email?.trim().charAt(0).toUpperCase() || 'T';
  let taskCount = pendingTaskCount;
  if (!Number.isInteger(taskCount)) {
    try { taskCount = await getAdminTaskCount(); } catch { taskCount = 0; }
  }
  const labels = Object.fromEntries(['overview', 'inbox', 'members', 'map', 'matrikkel', 'newsletters', 'surveys', 'web', 'usage', 'audit', 'navigation'].map((key) => [key, t(`admin.common.${key}`)]));
  labels.pendingTasks = t('admin.common.pendingTasks');
  const titles = { ...labels, overview: t('admin.common.memberService'), groups: t('admin.common.groups'), web: t('admin.pages.websites'), matrikkel: t('admin.pages.updateCadastral') };
  return <>
    <aside className="admin-sidebar">
      <Link className="admin-sidebar-brand" href="/admin"><BrandLogo variant="stacked" decorative className="admin-sidebar-logo" /><strong>{t('admin.common.memberService')}</strong></Link>
      <AdminNavigation labels={labels} taskCount={taskCount} visibleKeys={visibleKeys} />
      <div className="admin-account"><span className="admin-avatar" aria-hidden="true">{initial}</span><span className="admin-account-email">{email}</span><LogoutButton label={t('admin.common.logout')} /></div>
    </aside>
    <header className="admin-header">
      <details className="admin-mobile-menu">
        <summary><span className="visually-hidden">{t('admin.common.openMenu')}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg><strong>{t('admin.common.memberService')}</strong></summary>
        <div><AdminNavigation labels={labels} taskCount={taskCount} visibleKeys={visibleKeys} /><div className="admin-mobile-account"><span>{email}</span><LogoutButton label={t('admin.common.logout')} /></div></div>
      </details>
      <p className="eyebrow">Turufjell Vel</p>
      <AdminRouteHeading titles={titles} />
    </header>
    <span id="main-content" className="visually-hidden" tabIndex={-1}>{t('admin.common.contentStarts')}</span>
  </>;
}
