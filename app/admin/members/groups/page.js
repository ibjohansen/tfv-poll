import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/admin-access';
import { getMemberGroups } from '@/lib/member-groups';
import AdminModuleHeader from '@/components/AdminModuleHeader';
import AdminMemberGroups from '@/components/AdminMemberGroups';
import { getServerI18n } from '@/lib/i18n/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export default async function MemberGroupsPage() {
  const { t } = await getServerI18n();
  let user;
  try { user = await requirePermission('members'); } catch { redirect('/admin/login'); }
  let groups;
  try { groups = await getMemberGroups(); } catch { groups = null; }
  return <main className="admin-shell"><AdminModuleHeader active="members" title={t('admin.common.groups')} email={user.email} />
    <section className="admin-content">{groups ? <AdminMemberGroups initialGroups={groups} /> : <p role="alert" className="form-error">{t('admin.pages.groupsUnavailable')}</p>}</section>
  </main>;
}
