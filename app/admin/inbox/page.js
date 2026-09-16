import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { isAllowedAdmin, isAuthConfigured } from '@/lib/admin-policy';
import { getAdminMemberRequests } from '@/lib/member-self-service';
import AdminMemberRequests from '@/components/AdminMemberRequests';
import AdminModuleHeader from '@/components/AdminModuleHeader';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AdminInboxPage() {
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await auth();
  if (!isAllowedAdmin(session?.user)) redirect('/admin/login');
  let requests;
  try { requests = await getAdminMemberRequests(); } catch { requests = null; }
  return <main className="admin-shell"><AdminModuleHeader active="inbox" title="Oppgaveliste" email={session.user.email} pendingTaskCount={requests?.length} /><section className="admin-content">{requests ? <AdminMemberRequests initialRequests={requests} showEmpty /> : <p className="form-error" role="alert">Oppgavelisten er midlertidig utilgjengelig. Prøv igjen senere.</p>}</section></main>;
}
