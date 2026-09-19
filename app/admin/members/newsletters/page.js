import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/admin-access';
import { getMemberGroups } from '@/lib/member-groups';
import { getNewsletters } from '@/lib/newsletters';
import AdminNewsletters from '@/components/AdminNewsletters';
import { getServerI18n } from '@/lib/i18n/server';
import { adminPageMetadata } from '@/lib/page-metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const generateMetadata = () => adminPageMetadata('newsletters');
export default async function NewslettersPage() {
  const { t } = await getServerI18n();
  try { await requirePermission('members'); } catch { redirect('/admin/login'); }
  let data, groups;
  try { [data, groups] = await Promise.all([getNewsletters(), getMemberGroups()]); } catch { data = null; }
  return <section className="admin-content">{data ? <AdminNewsletters initialData={JSON.parse(JSON.stringify(data))} groups={groups.filter((group) => group.kind === 'email')} /> : <p role="alert" className="form-error">{t('admin.pages.newslettersUnavailable')}</p>}</section>;
}
