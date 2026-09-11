import Link from 'next/link';
import { signOut } from '@/auth';

const modules = [
  { href: '/admin', label: 'Oversikt', key: 'overview', icon: 'home' },
  { href: '/admin/inbox', label: 'Innboks', key: 'inbox', icon: 'inbox' },
  { href: '/admin/members', label: 'Medlemsregister', key: 'members', icon: 'members' },
  { href: '/admin/surveys', label: 'Undersøkelser', key: 'surveys', icon: 'surveys' },
  { href: '/admin/web', label: 'Web', key: 'web', icon: 'web' },
];

function ModuleIcon({ name }) {
  if (name === 'inbox') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4V4Zm0 11h4l2 2h4l2-2h4" /></svg>;
  if (name === 'members') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-5A4.5 4.5 0 0 0 2 18.5V20M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1a3 3 0 1 0 0-6m1 11a4 4 0 0 1 4 4v2" /></svg>;
  if (name === 'surveys') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10a2 2 0 0 1 2 2v16H5V5a2 2 0 0 1 2-2Zm2 5h6m-6 4h6m-6 4h4" /></svg>;
  if (name === 'web') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10H3V10Zm6 10v-6h6v6" /></svg>;
}

function Navigation({ active }) {
  return <nav className="admin-tabs" aria-label="Moduler i Medlemsservice">{modules.map((module) => <Link key={module.key} href={module.href} aria-current={active === module.key ? 'page' : undefined}><ModuleIcon name={module.icon} /><span>{module.label}</span></Link>)}</nav>;
}

function LogoutButton() {
  return <form action={async () => { 'use server'; await signOut({ redirectTo: '/admin/login' }); }}><button type="submit" className="admin-button">Logg ut</button></form>;
}

export default function AdminModuleHeader({ active, title, email }) {
  const initial = email?.trim().charAt(0).toUpperCase() || 'T';
  return <>
    <aside className="admin-sidebar">
      <Link className="admin-sidebar-brand" href="/admin"><span aria-hidden="true">TV</span><strong>Medlemsservice</strong></Link>
      <Navigation active={active} />
      <div className="admin-account"><span className="admin-avatar" aria-hidden="true">{initial}</span><span className="admin-account-email">{email}</span><LogoutButton /></div>
    </aside>
    <header className="admin-header">
      <details className="admin-mobile-menu">
        <summary><span className="visually-hidden">Åpne administrasjonsmenyen</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg><strong>Medlemsservice</strong></summary>
        <div><Navigation active={active} /><div className="admin-mobile-account"><span>{email}</span><LogoutButton /></div></div>
      </details>
      <p className="eyebrow">Turufjell vel</p>
      <h1>{title}</h1>
    </header>
  </>;
}
