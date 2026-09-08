import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { isAllowedAdmin, isAuthConfigured } from '@/lib/admin-policy';
import { getAdminSurveys } from '@/lib/admin-surveys';
import AdminSurveyDirectory from '@/components/AdminSurveyDirectory';
import AdminModuleHeader from '@/components/AdminModuleHeader';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AdminSurveysPage({ searchParams }) {
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await auth();
  if (!isAllowedAdmin(session?.user)) redirect('/admin/login');
  const params = await searchParams;
  const sort = ['title', 'is_open', 'ends_on', 'response_count', 'question_version'].includes(params.sort) ? params.sort : 'title';
  const direction = params.dir === 'desc' ? 'desc' : 'asc';
  let surveys;
  try { surveys = await getAdminSurveys(sort, direction); } catch { surveys = null; }
  return <main className="admin-shell"><AdminModuleHeader active="surveys" title="Undersøkelser" email={session.user.email} /><section className="admin-content">{surveys ? <AdminSurveyDirectory key={`${sort}-${direction}`} surveys={surveys} sort={sort} direction={direction} /> : <p className="form-error" role="alert">Undersøkelsene er midlertidig utilgjengelige. Prøv igjen senere.</p>}</section></main>;
}
