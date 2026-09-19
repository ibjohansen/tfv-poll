import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/admin-access';
import { getMemberGroups } from '@/lib/member-groups';
import AdminMemberGroups from '@/components/AdminMemberGroups';
import { getServerI18n } from '@/lib/i18n/server';
import { adminPageMetadata } from '@/lib/page-metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const generateMetadata = () => adminPageMetadata('groups');
export default async function MemberGroupsPage() {
  const { t } = await getServerI18n();
  try { await requirePermission('members'); } catch { redirect('/admin/login'); }
  let groups;
  try { groups = await getMemberGroups(); } catch { groups = null; }
  return <section className="admin-content">{groups ? <AdminMemberGroups initialGroups={groups} /> : <p role="alert" className="form-error">{t('admin.pages.groupsUnavailable')}</p>}</section>;
}
