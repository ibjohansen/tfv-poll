import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/admin-access';
import { adminPermissions } from '@/lib/admin-policy';
import { getAccountingOverview } from '@/lib/accounting';
import AdminAccounting from '@/components/AdminAccounting';
import { getServerI18n } from '@/lib/i18n/server';
import { adminPageMetadata } from '@/lib/page-metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const generateMetadata = () => adminPageMetadata('accounting');

export default async function AccountingPage({ searchParams }) {
  const { t } = await getServerI18n('accounting');
  let user;
  try { user = await requirePermission('read'); } catch { redirect('/admin/login'); }
  const { year = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Europe/Oslo' }).format(new Date()) } = await searchParams;
  let data, error;
  try { data = await getAccountingOverview(year); } catch (caught) { error = caught; }
  return <section className="admin-content">{data
    ? <AdminAccounting key={data.year} initialData={data} canWrite={adminPermissions(user).has('members')} currentUserName={(user.name?.trim() || user.email).slice(0, 320)} />
    : <p className="form-error" role="alert">{t(error?.code === 'invalidYear' ? 'errors.invalidYear' : 'unavailable')}</p>}</section>;
}
