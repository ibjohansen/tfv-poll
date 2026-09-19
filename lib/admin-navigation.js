export const adminModules = [
  { href: '/admin', key: 'overview', icon: 'home' },
  { href: '/admin/inbox', key: 'inbox', icon: 'inbox' },
  { href: '/admin/members', key: 'members', icon: 'members' },
  { href: '/admin/map', key: 'map', icon: 'web' },
  { href: '/admin/members/matrikkel', key: 'matrikkel', icon: 'members' },
  { href: '/admin/members/newsletters', key: 'newsletters', icon: 'newsletter' },
  { href: '/admin/surveys', key: 'surveys', icon: 'surveys' },
  { href: '/admin/web', key: 'web', icon: 'web' },
  { href: '/admin/usage', key: 'usage', icon: 'usage' },
  { href: '/admin/audit', key: 'audit', icon: 'audit' },
];

export function activeAdminModule(pathname) {
  if (pathname.startsWith('/admin/members/matrikkel')) return 'matrikkel';
  if (pathname.startsWith('/admin/members/newsletters')) return 'newsletters';
  if (pathname.startsWith('/admin/members')) return 'members';
  if (pathname.startsWith('/admin/inbox')) return 'inbox';
  if (pathname.startsWith('/admin/surveys')) return 'surveys';
  if (pathname.startsWith('/admin/web')) return 'web';
  if (pathname.startsWith('/admin/usage')) return 'usage';
  if (pathname.startsWith('/admin/audit')) return 'audit';
  if (pathname.startsWith('/admin/map')) return 'map';
  return 'overview';
}
