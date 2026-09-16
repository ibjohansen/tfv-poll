import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { isAllowedMatrikkelSync, isAuthConfigured } from '@/lib/admin-policy';
import { getMatrikkelMemberOptions, getMatrikkelRuns, isMatrikkelConfigured } from '@/lib/matrikkel-sync';
import AdminModuleHeader from '@/components/AdminModuleHeader';
import MatrikkelSyncPanel from '@/components/MatrikkelSyncPanel';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function MatrikkelSyncPage({ searchParams }) {
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await auth();
  if (!isAllowedMatrikkelSync(session?.user)) redirect('/admin');
  const params = await searchParams;
  const requestedMemberId = /^[1-9][0-9]{0,15}$/.test(params?.member || '') ? params.member : '';
  const requestedMemberIds = String(params?.members || '').split(',').filter(Boolean).slice(0, 500)
    .filter((id) => /^[1-9][0-9]{0,15}$/.test(id));
  let runs = [];
  let members = [];
  let databaseReady = true;
  try { [runs, members] = await Promise.all([getMatrikkelRuns(), getMatrikkelMemberOptions()]); } catch { databaseReady = false; }
  const initialMemberId = members.some((member) => member.id === requestedMemberId) ? requestedMemberId : '';
  const initialMemberIds = [...new Set(requestedMemberIds)].filter((id) => members.some((member) => member.id === id));
  return <main className="admin-shell"><AdminModuleHeader active="matrikkel" title="Oppdater matrikkeldata" email={session.user.email} /><section className="admin-content"><MatrikkelSyncPanel initialRuns={runs} members={members} initialMemberId={initialMemberId} initialMemberIds={initialMemberIds} configured={isMatrikkelConfigured()} databaseReady={databaseReady} /></section></main>;
}
