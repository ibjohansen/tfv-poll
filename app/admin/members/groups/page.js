import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/admin-access';
import { getMemberGroups } from '@/lib/member-groups';
import AdminModuleHeader from '@/components/AdminModuleHeader';
import AdminMemberGroups from '@/components/AdminMemberGroups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export default async function MemberGroupsPage() {
  let user;
  try { user = await requirePermission('members'); } catch { redirect('/admin/login'); }
  let groups;
  try { groups = await getMemberGroups(); } catch { groups = null; }
  return <main className="admin-shell"><AdminModuleHeader active="members" title="Grender og e-postgrupper" email={user.email} />
    <section className="admin-content">{groups ? <AdminMemberGroups initialGroups={groups} /> : <p role="alert" className="form-error">Gruppene er midlertidig utilgjengelige.</p>}</section>
  </main>;
}
