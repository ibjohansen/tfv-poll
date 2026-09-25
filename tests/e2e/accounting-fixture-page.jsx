// Copied only into the disposable app by server.mjs. Never a production route.
import { requirePermission } from '@/lib/admin-access';
import { adminPermissions } from '@/lib/admin-policy';
import AdminAccounting from '@/components/AdminAccounting';
import { proposeAccountingYear } from '@/lib/accounting-validation';

export default async function AccountingFixture() {
  const user = await requirePermission('read');
  return <section className="admin-content"><AdminAccounting canWrite={adminPermissions(user).has('members')} initialData={{
    year: 2026, years: [2026], settings: { ...proposeAccountingYear(2026, 411), version: 1 },
    memberCount: 420, paidMemberCount: 400, expenses: [], attachments: [],
  }} /></section>;
}
