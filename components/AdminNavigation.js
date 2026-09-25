'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { activeAdminModule, adminModules } from '@/lib/admin-navigation';

export function ModuleIcon({ name }) {
  if (name === 'accounting') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14v18H5V3Zm3 4h8M8 11h2m4 0h2m-8 4h2m4 0h2m-8 3h2m4 0h2" /></svg>;
  if (name === 'inbox') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4V4Zm0 11h4l2 2h4l2-2h4" /></svg>;
  if (name === 'members') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-5A4.5 4.5 0 0 0 2 18.5V20M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1a3 3 0 1 0 0-6m1 11a4 4 0 0 1 4 4v2" /></svg>;
  if (name === 'surveys') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10a2 2 0 0 1 2 2v16H5V5a2 2 0 0 1 2-2Zm2 5h6m-6 4h6m-6 4h4" /></svg>;
  if (name === 'web') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z" /></svg>;
  if (name === 'audit') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18H6V3Zm3 5h6m-6 4h6m-6 4h4" /></svg>;
  if (name === 'usage') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10m6 10V4m6 16v-7m4 7H2" /></svg>;
  if (name === 'newsletter') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v14H3V5Zm1 1 8 7 8-7" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10H3V10Zm6 10v-6h6v6" /></svg>;
}

function closeMobileMenu(event) {
  event.currentTarget.closest('details')?.removeAttribute('open');
}

export default function AdminNavigation({ labels, taskCount, visibleKeys }) {
  const pathname = usePathname();
  const active = activeAdminModule(pathname);
  const visible = new Set(visibleKeys);

  return <nav className="admin-tabs" aria-label={labels.navigation}>{adminModules.filter(({ key }) => visible.has(key)).map((module) => <Link key={module.key} href={module.href} aria-current={active === module.key ? 'page' : undefined} onClick={closeMobileMenu}><ModuleIcon name={module.icon} /><span>{labels[module.key]}</span>{module.key === 'inbox' && taskCount > 0 && <span className="admin-nav-count" aria-label={labels.pendingTasks.replace('{count}', taskCount)}>{taskCount}</span>}</Link>)}</nav>;
}

export function AdminRouteHeading({ titles }) {
  const pathname = usePathname();
  const active = activeAdminModule(pathname);
  const title = pathname.startsWith('/admin/members/groups') ? titles.groups : titles[active];

  return <h1>{title}</h1>;
}
