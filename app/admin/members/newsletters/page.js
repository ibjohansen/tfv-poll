import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/admin-access';
import { getMemberGroups } from '@/lib/member-groups';
import { getNewsletters } from '@/lib/newsletters';
import AdminModuleHeader from '@/components/AdminModuleHeader';
import AdminNewsletters from '@/components/AdminNewsletters';
import { getServerI18n } from '@/lib/i18n/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export default async function NewslettersPage() {
  const { t } = await getServerI18n();
  let user;
  try { user = await requirePermission('members'); } catch { redirect('/admin/login'); }
  let data, groups;
  try { [data, groups] = await Promise.all([getNewsletters(), getMemberGroups()]); } catch { data = null; }
  return <main className="admin-shell"><AdminModuleHeader active="newsletters" title={t('admin.common.newsletters')} email={user.email} />
    <section className="admin-content">{data ? <AdminNewsletters initialData={JSON.parse(JSON.stringify(data))} groups={groups.filter((group) => group.kind === 'email')} /> : <p role="alert" className="form-error">{t('admin.pages.newslettersUnavailable')}</p>}</section>
  </main>;
}
