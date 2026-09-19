import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/admin-access';
import { isAllowedAdmin, isAuthConfigured } from '@/lib/admin-policy';
import { getAdminSurveys } from '@/lib/admin-surveys';
import AdminSurveyDirectory from '@/components/AdminSurveyDirectory';
import AdminModuleHeader from '@/components/AdminModuleHeader';
import { getServerI18n } from '@/lib/i18n/server';
import { adminPageMetadata } from '@/lib/page-metadata';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const generateMetadata = () => adminPageMetadata('surveys');

export default async function AdminSurveysPage({ searchParams }) {
  const { t } = await getServerI18n();
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await getAdminSession();
  if (!isAllowedAdmin(session?.user)) redirect('/admin/login');
  const params = await searchParams;
  const sort = ['title', 'is_open', 'ends_on', 'response_count', 'question_version'].includes(params.sort) ? params.sort : 'title';
  const direction = params.dir === 'desc' ? 'desc' : 'asc';
  let surveys;
  try { surveys = await getAdminSurveys(sort, direction); } catch { surveys = null; }
  return <main className="admin-shell"><AdminModuleHeader active="surveys" title={t('admin.common.surveys')} email={session.user.email} /><section className="admin-content">{surveys ? <AdminSurveyDirectory key={`${sort}-${direction}`} surveys={surveys} sort={sort} direction={direction} adminEmail={session.user.email} /> : <p className="form-error" role="alert">{t('admin.pages.surveysUnavailable')}</p>}</section></main>;
}
