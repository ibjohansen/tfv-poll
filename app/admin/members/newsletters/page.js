import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/admin-access';
import { getMemberGroups } from '@/lib/member-groups';
import { getNewsletters } from '@/lib/newsletters';
import AdminModuleHeader from '@/components/AdminModuleHeader';
import AdminNewsletters from '@/components/AdminNewsletters';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export default async function NewslettersPage() {
  let user;
  try { user = await requirePermission('members'); } catch { redirect('/admin/login'); }
  let data, groups;
  try { [data, groups] = await Promise.all([getNewsletters(), getMemberGroups()]); } catch { data = null; }
  return <main className="admin-shell"><AdminModuleHeader active="newsletters" title="Nyhetsbrev" email={user.email} />
    <section className="admin-content">{data ? <AdminNewsletters initialData={JSON.parse(JSON.stringify(data))} groups={groups.filter((group) => group.kind === 'email')} /> : <p role="alert" className="form-error">Nyhetsbrevene er midlertidig utilgjengelige.</p>}</section>
  </main>;
}
