import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { isAllowedAdmin, isAllowedMatrikkelSync, isAuthConfigured } from '@/lib/admin-policy';
import { getAdminMemberById, getAdminMembers } from '@/lib/admin-members';
import { getAdminSurveys } from '@/lib/admin-surveys';
import AdminMemberDirectory from '@/components/AdminMemberDirectory';
import AdminModuleHeader from '@/components/AdminModuleHeader';
import { getMemberGroups } from '@/lib/member-groups';

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
  const hasComment = params.comment === 'present';
  const membershipStatus = ['member', 'exempt'].includes(params.membership) ? params.membership : '';
  const hamletId = params.hamlet === 'unassigned' || /^[1-9][0-9]{0,15}$/.test(params.hamlet || '') ? params.hamlet : '';
  const groupId = /^[1-9][0-9]{0,15}$/.test(params.group || '') ? params.group : '';
  const turufjellAsSharing = ['allowed', 'opted_out'].includes(params.sharing) ? params.sharing : '';
  const selectedId = /^\d+$/.test(params.member || '') ? params.member : '';
  let data;
  let surveys;
  let initialSelected;
  let groups;
  try { [data, surveys, initialSelected, groups] = await Promise.all([getAdminMembers(search, 1, sort, direction, incompleteContact, hasComment, { membershipStatus, hamletId, groupId, turufjellAsSharing }), getAdminSurveys(), selectedId ? getAdminMemberById(selectedId) : null, getMemberGroups()]); } catch { data = null; }
  return <main className="admin-shell"><AdminModuleHeader active="members" title="Medlemsregister" email={session.user.email} /><section className="admin-content">{!data ? <p className="form-error" role="alert">Medlemsregisteret er midlertidig utilgjengelig. Prøv igjen senere.</p> : <AdminMemberDirectory key={`${search}-${sort}-${direction}-${incompleteContact}-${hasComment}-${selectedId}-${membershipStatus}-${hamletId}-${groupId}-${turufjellAsSharing}`} data={data} surveys={surveys} search={search} sort={sort} direction={direction} incompleteContact={incompleteContact} hasComment={hasComment} initialSelected={initialSelected} membershipStatus={membershipStatus} hamletId={hamletId} groupId={groupId} turufjellAsSharing={turufjellAsSharing} groups={groups} canMatrikkelSync={isAllowedMatrikkelSync(session.user)} />}</section></main>;
}
