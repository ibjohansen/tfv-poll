import { randomUUID } from 'node:crypto';
import { requirePermission } from '@/lib/admin-access';
import { getAccountingOverview } from '@/lib/accounting';
import { accountingCsv } from '@/lib/accounting-export';
import { accountingFailure } from '@/lib/accounting-http';
import { AccountingError } from '@/lib/accounting-validation';
import { getRequestI18n } from '@/lib/i18n/request';
import { getSql } from '@/lib/db';
import { isMockMode } from '@/lib/mock-store';

export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const user = await requirePermission('read');
    if (isMockMode()) throw new AccountingError('mock', 409);
    const data = await getAccountingOverview(new URL(request.url).searchParams.get('year'));
    const { t } = getRequestI18n(request, 'accounting');
    const csv = accountingCsv(data, t);
    await getSql()`INSERT INTO audit_log (table_name, row_id, operation, changed_by, after_value)
      VALUES ('admin_actions', ${randomUUID()}, 'INSERT', ${user.email.toLowerCase()},
        ${JSON.stringify({ action: 'accounting_export', year: data.year, count: data.expenses.length })}::jsonb)`;
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="regnskap-${data.year}.csv"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return accountingFailure(error); }
}
