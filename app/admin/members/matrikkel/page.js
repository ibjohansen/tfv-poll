import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { isAllowedMatrikkelSync, isAuthConfigured } from '@/lib/admin-policy';
import { getMatrikkelMemberOptions, getMatrikkelRun, getMatrikkelRuns, isMatrikkelConfigured } from '@/lib/matrikkel-sync';
import AdminModuleHeader from '@/components/AdminModuleHeader';
import MatrikkelSyncPanel from '@/components/MatrikkelSyncPanel';
import { getServerI18n } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function MatrikkelSyncPage({ searchParams }) {
  const { t } = await getServerI18n('admin.pages');
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await auth();
  if (!isAllowedMatrikkelSync(session?.user)) redirect('/admin');
  const params = await searchParams;
  const requestedMemberId = /^[1-9][0-9]{0,15}$/.test(params?.member || '') ? params.member : '';
  const requestedMemberIds = String(params?.members || '').split(',').filter(Boolean).slice(0, 500)
    .filter((id) => /^[1-9][0-9]{0,15}$/.test(id));
  const requestedRunId = /^[a-f0-9]{32}$/.test(params?.run || '') ? params.run : '';
  let runs = [];
  let members = [];
  let databaseReady = true;
  try {
    [runs, members] = await Promise.all([getMatrikkelRuns(), getMatrikkelMemberOptions()]);
    if (requestedRunId && !runs.some((run) => run.id === requestedRunId)) {
      try { runs = [await getMatrikkelRun(requestedRunId), ...runs]; } catch { /* Unknown or hidden run: show ordinary history. */ }
    }
  } catch { databaseReady = false; }
  const initialMemberId = members.some((member) => member.id === requestedMemberId) ? requestedMemberId : '';
  const initialMemberIds = [...new Set(requestedMemberIds)].filter((id) => members.some((member) => member.id === id));
  const initialRunId = runs.some((run) => run.id === requestedRunId) ? requestedRunId : '';
  return <main className="admin-shell"><AdminModuleHeader active="matrikkel" title={t('updateCadastral')} email={session.user.email} /><section className="admin-content"><MatrikkelSyncPanel initialRuns={runs} members={members} initialMemberId={initialMemberId} initialMemberIds={initialMemberIds} initialRunId={initialRunId} configured={isMatrikkelConfigured()} databaseReady={databaseReady} /></section></main>;
}
