import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import AdminModuleHeader from '@/components/AdminModuleHeader';
import AdminUsageStatistics from '@/components/AdminUsageStatistics';
import { isAllowedAdmin, isAuthConfigured } from '@/lib/admin-policy';
import { getUsageStatistics } from '@/lib/usage-statistics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AdminUsagePage({ searchParams }) {
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await auth();
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
  return <main className="admin-shell"><AdminModuleHeader active="usage" title="Bruksstatistikk" email={session.user.email} /><section className="admin-content">{data ? <AdminUsageStatistics data={data} /> : <p className="form-error" role="alert">{invalidPeriod ? <>Perioden er ugyldig. <Link href="/admin/usage">Vis 30 dager</Link>.</> : 'Bruksstatistikken er midlertidig utilgjengelig. Kontroller at databaseskjemaet er oppdatert.'}</p>}</section></main>;
}
