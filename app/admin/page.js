import { redirect } from 'next/navigation';
import Link from 'next/link';
import { isAllowedAdmin, isAuthConfigured } from '@/lib/admin-policy';
import { getAdminSession } from '@/lib/admin-access';
import { getAdminTaskCount } from '@/lib/member-self-service';
import { ModuleIcon } from '@/components/AdminNavigation';
import { adminModules } from '@/lib/admin-navigation';
import { getServerI18n } from '@/lib/i18n/server';
import { adminPageMetadata } from '@/lib/page-metadata';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const generateMetadata = () => adminPageMetadata('overview');

export default async function AdminPage() {
  const { t } = await getServerI18n();
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await getAdminSession();
  if (!isAllowedAdmin(session?.user)) redirect('/admin/login');
  let taskCount = 0;
  try { taskCount = await getAdminTaskCount(); } catch { /* Header and tile remain usable without a count. */ }
  const modules = adminModules.filter(({ key }) => key !== 'overview');
  return <section className="admin-content"><section className="admin-module-grid" aria-label={t('admin.common.modules')}>{modules.map((module) => <Link href={module.href} className="admin-module-card" key={module.key}><div className="admin-module-title"><h2>{t(`admin.common.${module.key}`)}</h2>{module.key === 'inbox' && taskCount > 0 && <span className="admin-task-count">{t(taskCount === 1 ? 'admin.home.pendingOne' : 'admin.home.pendingMany', {count: taskCount})}</span>}</div><p>{t(`admin.home.descriptions.${module.key}`)}</p><span className="module-link"><span>{t('admin.common.open')}</span><ModuleIcon name={module.icon} /></span></Link>)}</section></section>;
}
