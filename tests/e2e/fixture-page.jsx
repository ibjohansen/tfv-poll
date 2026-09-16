// Copied ONLY into the isolated temporary app by server.mjs. This is never
// present in the production app directory or build. All values are synthetic.
import { requirePermission } from '@/lib/admin-access';
import MemberSelfServiceProfile from '@/components/MemberSelfServiceProfile';
import AdminMemberRequests from '@/components/AdminMemberRequests';
import AdminAuditLog from '@/components/AdminAuditLog';
import AdminNewsletters from '@/components/AdminNewsletters';
import SurveyEmailPanel from '@/components/SurveyEmailPanel';
import AdminUsageStatistics from '@/components/AdminUsageStatistics';
import MatrikkelSyncPanel from '@/components/MatrikkelSyncPanel';
import { surveyId } from '@/data/survey';

export default async function BrowserFixtures() {
  await requirePermission('members');
  const member = { id: '7001', h_number: 'H-SYNTHETIC-1', street_address: 'Testvegen 1', cadastral_number: '10/7001',
    primary_contact_name: 'Syntetisk kontakt', primary_contact_email: 'fixture@example.invalid', other_contact_emails: [] };
  return <main className="admin-main"><h1>Isolerte komponenttester</h1>
    <MemberSelfServiceProfile initialProfile={{ member, properties: [member, { id: '7002', h_number: 'H-SYNTHETIC-2', street_address: 'Testvegen 2' }],
      responses: [], deliveries: [], requests: [], updates: [{ created_at: '2026-09-15T12:00:00Z', changed_fields: ['primary_contact_name'], comment: '<img src=x onerror=alert(1)>' }] }} />
    <AdminMemberRequests showEmpty initialRequests={[{ id: '7003', member_id: '7001', request_type: 'profile_update', status: 'completed', h_number: 'H-SYNTHETIC-1',
      requested_comment: '<b>Syntetisk kommentar</b>', requested_contact_name: 'Syntetisk kontakt', requested_primary_email: 'fixture@example.invalid', street_address: 'Testvegen 1' }]} />
    <AdminAuditLog filters={{ q: 'Syntetisk', actor: '', table: '', operation: '', status: '', from: '', to: '' }} tables={['members']} data={{ page: 1, pageSize: 50, total: 51, actors: ['admin@example.invalid'], entries: [{ id: 'audit:7001', table_name: 'members', row_id: '7001', operation: 'UPDATE', changed_by: 'admin@example.invalid', changed_at: '2026-09-15T12:00:00Z',
      before_value: { primary_contact_name: 'Syntetisk før' }, after_value: { primary_contact_name: '<script>Syntetisk etter</script>' } }] }} />
    <section aria-label="Test av nyhetsbrev"><AdminNewsletters initialData={{ campaigns: [], campaign: null, deliveries: [], bulkEnabled: true }} groups={[{ id: '7101', name: 'Syntetisk e-postgruppe', email_count: 2 }]} /></section>
    <SurveyEmailPanel surveyId={surveyId} adminEmail="admin@example.invalid" />
    <section aria-label="Test av bruksstatistikk"><AdminUsageStatistics data={{ period: 30, granularity: 'day', from: '2026-09-11', to: '2026-09-15', total: 18,
      trend: [{ date: '2026-09-11', views: 2 }, { date: '2026-09-12', views: 4 }, { date: '2026-09-13', views: 3 }, { date: '2026-09-14', views: 7 }, { date: '2026-09-15', views: 2 }],
      pages: [{ pageType: 'home', views: 12 }, { pageType: 'article', views: 6 }], devices: [{ deviceCategory: 'desktop', views: 13 }, { deviceCategory: 'mobile', views: 5 }] }} /></section>
    <section aria-label="Test av matrikkelvalg"><MatrikkelSyncPanel initialRuns={[]} configured databaseReady members={[
      { id: '701', h_number: 'H241', street_address: 'Istjernvegen 54', cadastral_number: '10/524' },
      { id: '702', h_number: 'H392', street_address: 'Øvre Sprenåsen 37', cadastral_number: null },
    ]} /></section>
  </main>;
}
