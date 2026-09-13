import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { isAllowedMatrikkelSync, isAuthConfigured } from '@/lib/admin-policy';
import { getMatrikkelRuns, isMatrikkelConfigured } from '@/lib/matrikkel-sync';
import AdminModuleHeader from '@/components/AdminModuleHeader';
import MatrikkelSyncPanel from '@/components/MatrikkelSyncPanel';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function MatrikkelSyncPage() {
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await auth();
  if (!isAllowedMatrikkelSync(session?.user)) redirect('/admin');
  let runs = [];
  let databaseReady = true;
  try { runs = await getMatrikkelRuns(); } catch { databaseReady = false; }
  return <main className="admin-shell"><AdminModuleHeader active="matrikkel" title="Oppdater matrikkeldata" email={session.user.email} /><section className="admin-content"><MatrikkelSyncPanel initialRuns={runs} configured={isMatrikkelConfigured()} databaseReady={databaseReady} /></section></main>;
}
