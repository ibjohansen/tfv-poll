import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAdminSession } from '@/lib/admin-access';
import AdminModuleHeader from '@/components/AdminModuleHeader';
import AdminUsageStatistics from '@/components/AdminUsageStatistics';
import { isAllowedAdmin, isAuthConfigured } from '@/lib/admin-policy';
import { getUsageStatistics } from '@/lib/usage-statistics';
import { getServerI18n } from '@/lib/i18n/server';
import { adminPageMetadata } from '@/lib/page-metadata';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const generateMetadata = () => adminPageMetadata('usage');

export default async function AdminUsagePage({ searchParams }) {
  const { t } = await getServerI18n();
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await getAdminSession();
  if (!isAllowedAdmin(session?.user)) redirect('/admin/login');
  const params = await searchParams;
  let data;
  let invalidPeriod = false;
  try {
    data = await getUsageStatistics({ days: params?.days });
  } catch (error) {
    invalidPeriod = error.message === 'Invalid usage period';
    console.error('Admin usage statistics unavailable', {
      name: error?.name || 'Error',
      code: error?.code || error?.cause?.code || undefined,
    });
  }
  return <main className="admin-shell"><AdminModuleHeader active="usage" title={t('admin.common.usage')} email={session.user.email} /><section className="admin-content">{data ? <AdminUsageStatistics data={data} /> : <p className="form-error" role="alert">{invalidPeriod ? <>{t('admin.pages.invalidPeriod')} <Link href="/admin/usage">{t('admin.pages.show30Days')}</Link>.</> : t('admin.pages.usageUnavailable')}</p>}</section></main>;
}
