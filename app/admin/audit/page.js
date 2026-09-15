import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import AdminAuditLog from '@/components/AdminAuditLog';
import AdminModuleHeader from '@/components/AdminModuleHeader';
import { getAdminAuditLog, getAuditedTables } from '@/lib/admin-audit';
import { isAllowedAdmin, isAuthConfigured } from '@/lib/admin-policy';
import { normalizeAuditFilters } from '@/lib/audit-filters';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AdminAuditPage({ searchParams }) {
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await auth();
  if (!isAllowedAdmin(session?.user)) redirect('/admin/login');
  const params = await searchParams;
  const tables = getAuditedTables();
  let filters;
  let filterError = false;
  let data;
  try {
    filters = normalizeAuditFilters(params);
    data = await getAdminAuditLog(filters);
  } catch (error) {
    // Keep the public response generic, but leave a safe diagnostic in the
    // server log so database and authorization failures can be distinguished.
    console.error('Admin audit log unavailable', {
      name: error?.name || 'Error',
      code: error?.code || error?.cause?.code || undefined,
    });
    filterError = error.message.startsWith('Invalid audit date');
    data = null;
  }
  return <main className="admin-shell"><AdminModuleHeader active="audit" title="Brukerendringer" email={session.user.email} /><section className="admin-content">{data ? <AdminAuditLog data={data} filters={filters} tables={tables} /> : <p className="form-error" role="alert">{filterError ? <>Datointervallet er ugyldig. <Link href="/admin/audit">Nullstill filtrene</Link>.</> : 'Endringsloggen er midlertidig utilgjengelig. Kontroller at databaseskjemaet er oppdatert.'}</p>}</section></main>;
}
