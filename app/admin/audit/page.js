import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAdminSession } from '@/lib/admin-access';
import AdminAuditLog from '@/components/AdminAuditLog';
import { getAdminAuditLog, getAuditedTables } from '@/lib/admin-audit';
import { isAllowedAdmin, isAuthConfigured } from '@/lib/admin-policy';
import { normalizeAuditFilters } from '@/lib/audit-filters';
import { getServerI18n } from '@/lib/i18n/server';
import { adminPageMetadata } from '@/lib/page-metadata';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const generateMetadata = () => adminPageMetadata('audit');

export default async function AdminAuditPage({ searchParams }) {
  const { t } = await getServerI18n();
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await getAdminSession();
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
  return <section className="admin-content">{data ? <AdminAuditLog data={data} filters={filters} tables={tables} /> : <p className="form-error" role="alert">{filterError ? <>{t('admin.pages.invalidDates')} <Link href="/admin/audit">{t('admin.pages.resetFilters')}</Link>.</> : t('admin.pages.auditUnavailable')}</p>}</section>;
}
