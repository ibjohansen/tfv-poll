// Installed only in the disposable browser test app. All data is synthetic;
// PATCH requests are intercepted by Playwright, and real mail/DB are disabled.
import { requirePermission } from '@/lib/admin-access';
import AdminMemberDirectory from '@/components/AdminMemberDirectory';

export default async function MemberFixtures() {
  await requirePermission('members');
  const member = { id: '7001', h_number: 'H-TEST-001', cadastral_number: '10/7001', section_number: '2',
    street_address: '', title_holder: 'Syntetisk eier', registration_date: '01.01.2026',
    primary_contact_name: 'Syntetisk kontakt', primary_contact_email: 'fixture@example.invalid', other_contact_emails: [],
    admin_comment: '', membership_status: 'member', turufjell_as_sharing_opt_out: false };
  return <main className="admin-main"><h1>Isolert test av medlemsregister</h1>
    <AdminMemberDirectory data={{ members: [member], total: 1, pageSize: 50, mock: false }}
      search="" sort="h_number" direction="asc" /></main>;
}
