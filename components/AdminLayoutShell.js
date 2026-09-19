'use client';

import { usePathname } from 'next/navigation';

export default function AdminLayoutShell({ chrome, children }) {
  const pathname = usePathname();

  if (pathname.startsWith('/admin/web/preview/')) return children;

  return <main className="admin-shell">{chrome}{children}</main>;
}
