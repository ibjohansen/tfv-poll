import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/admin-access';
import { getAccountingOverview } from '@/lib/accounting';
import { accountingYear } from '@/lib/accounting-validation';
import { getServerI18n } from '@/lib/i18n/server';
import AccountingReport from '@/components/AccountingReport';
import { adminPageMetadata } from '@/lib/page-metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const generateMetadata = () => adminPageMetadata('accounting');

export default async function AnnualMeetingPage({ searchParams }) {
  const { t } = await getServerI18n('accounting');
  try { await requirePermission('read'); } catch { redirect('/admin/login'); }
  let data;
  try {
    const year = accountingYear((await searchParams).year);
    data = await Promise.all([getAccountingOverview(year - 1), getAccountingOverview(year)]);
  } catch { return <section className="admin-content"><p role="alert" className="form-error">{t('unavailable')}</p></section>; }
  return <section className="admin-content"><AccountingReport current={data[0]} next={data[1]} /></section>;
}
