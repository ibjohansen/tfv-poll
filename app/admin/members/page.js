import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { isAllowedAdmin, isAuthConfigured } from '@/lib/admin-policy';
import { getAdminMembers } from '@/lib/admin-members';
import { getAdminSurveys } from '@/lib/admin-surveys';
import AdminMemberDirectory from '@/components/AdminMemberDirectory';
import AdminModuleHeader from '@/components/AdminModuleHeader';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AdminMembersPage({ searchParams }) {
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await auth();
  if (!isAllowedAdmin(session?.user)) redirect('/admin/login');
  const params = await searchParams;
  const search = typeof params.q === 'string' ? params.q.trim().slice(0, 200) : '';
  const sort = ['h_number', 'street_address', 'title_holder', 'primary_contact_email'].includes(params.sort) ? params.sort : 'h_number';
  const direction = params.dir === 'desc' ? 'desc' : 'asc';
  const incompleteContact = params.contact === 'incomplete';
  let data;
  let surveys;
  try { [data, surveys] = await Promise.all([getAdminMembers(search, 1, sort, direction, incompleteContact), getAdminSurveys()]); } catch { data = null; }
  return <main className="admin-shell"><AdminModuleHeader active="members" title="Medlemsregister" email={session.user.email} /><section className="admin-content">{!data ? <p className="form-error" role="alert">Medlemsregisteret er midlertidig utilgjengelig. Prøv igjen senere.</p> : <AdminMemberDirectory key={`${search}-${sort}-${direction}-${incompleteContact}`} data={data} surveys={surveys} search={search} sort={sort} direction={direction} incompleteContact={incompleteContact} />}</section></main>;
}
