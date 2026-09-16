import Link from 'next/link';
import { signOut } from '@/auth';
import BrandLogo from '@/components/BrandLogo';
import { getAdminTaskCount } from '@/lib/member-self-service';

export const adminModules = [
  { href: '/admin', label: 'Oversikt', key: 'overview', icon: 'home' },
  { href: '/admin/inbox', label: 'Oppgaveliste', key: 'inbox', icon: 'inbox' },
  { href: '/admin/members', label: 'Medlemsregister', key: 'members', icon: 'members' },
  { href: '/admin/map', label: 'Kart og registerkontroll', key: 'map', icon: 'web' },
  { href: '/admin/members/matrikkel', label: 'Matrikkel', key: 'matrikkel', icon: 'members' },
  { href: '/admin/members/newsletters', label: 'Nyhetsbrev', key: 'newsletters', icon: 'newsletter' },
  { href: '/admin/surveys', label: 'Undersøkelser', key: 'surveys', icon: 'surveys' },
  { href: '/admin/web', label: 'Web', key: 'web', icon: 'web' },
  { href: '/admin/usage', label: 'Bruksstatistikk', key: 'usage', icon: 'usage' },
  { href: '/admin/audit', label: 'Brukerendringer', key: 'audit', icon: 'audit' },
];

export function ModuleIcon({ name }) {
  if (name === 'inbox') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4V4Zm0 11h4l2 2h4l2-2h4" /></svg>;
  if (name === 'members') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-5A4.5 4.5 0 0 0 2 18.5V20M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1a3 3 0 1 0 0-6m1 11a4 4 0 0 1 4 4v2" /></svg>;
  if (name === 'surveys') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10a2 2 0 0 1 2 2v16H5V5a2 2 0 0 1 2-2Zm2 5h6m-6 4h6m-6 4h4" /></svg>;
  if (name === 'web') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z" /></svg>;
  if (name === 'audit') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18H6V3Zm3 5h6m-6 4h6m-6 4h4" /></svg>;
  if (name === 'usage') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10m6 10V4m6 16v-7m4 7H2" /></svg>;
  if (name === 'newsletter') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v14H3V5Zm1 1 8 7 8-7" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10H3V10Zm6 10v-6h6v6" /></svg>;
}

function Navigation({ active, taskCount }) {
  return <nav className="admin-tabs" aria-label="Moduler i Medlemsservice">{adminModules.map((module) => <Link key={module.key} href={module.href} aria-current={active === module.key ? 'page' : undefined}><ModuleIcon name={module.icon} /><span>{module.label}</span>{module.key === 'inbox' && taskCount > 0 && <span className="admin-nav-count" aria-label={`${taskCount} ubehandlede oppgaver`}>{taskCount}</span>}</Link>)}</nav>;
}

function LogoutButton() {
  return <form action={async () => { 'use server'; await signOut({ redirectTo: '/admin/login' }); }}><button type="submit" className="admin-button">Logg ut</button></form>;
}

export default async function AdminModuleHeader({ active, title, email, pendingTaskCount }) {
  const initial = email?.trim().charAt(0).toUpperCase() || 'T';
  let taskCount = pendingTaskCount;
  if (!Number.isInteger(taskCount)) {
    try { taskCount = await getAdminTaskCount(); } catch { taskCount = 0; }
  }
  return <>
    <aside className="admin-sidebar">
      <Link className="admin-sidebar-brand" href="/admin"><BrandLogo variant="stacked" decorative className="admin-sidebar-logo" /><strong>Medlemsservice</strong></Link>
      <Navigation active={active} taskCount={taskCount} />
      <div className="admin-account"><span className="admin-avatar" aria-hidden="true">{initial}</span><span className="admin-account-email">{email}</span><LogoutButton /></div>
    </aside>
    <header className="admin-header">
      <details className="admin-mobile-menu">
        <summary><span className="visually-hidden">Åpne administrasjonsmenyen</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg><strong>Medlemsservice</strong></summary>
        <div><Navigation active={active} taskCount={taskCount} /><div className="admin-mobile-account"><span>{email}</span><LogoutButton /></div></div>
      </details>
      <p className="eyebrow">Turufjell Vel</p>
      <h1>{title}</h1>
    </header>
  </>;
}
