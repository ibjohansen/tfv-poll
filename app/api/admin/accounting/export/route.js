import { randomUUID } from 'node:crypto';
import { requirePermission } from '@/lib/admin-access';
import { getAccountingOverview } from '@/lib/accounting';
import { accountingWorkbook } from '@/lib/accounting-export';
import { accountingFailure, accountingWriteRequest } from '@/lib/accounting-http';
import { AccountingError, accountingId } from '@/lib/accounting-validation';
import { getRequestI18n } from '@/lib/i18n/request';
import { getSql } from '@/lib/db';
import { isMockMode } from '@/lib/mock-store';

export const runtime = 'nodejs';

async function exportResponse(request, input) {
  const user = await requirePermission('read');
  if (isMockMode()) throw new AccountingError('mock', 409);
  const data = await getAccountingOverview(input.year);
  if (input.ids) {
    if (!Array.isArray(input.ids) || !input.ids.length || input.ids.length > 5000) throw new AccountingError('invalidInput');
    const ids = input.ids.map(accountingId);
    if (new Set(ids).size !== ids.length) throw new AccountingError('invalidInput');
    const requested = new Set(ids);
    data.expenses = data.expenses.filter((expense) => requested.has(expense.id));
    if (data.expenses.length !== requested.size) throw new AccountingError('invalidInput');
  }
  const { t } = getRequestI18n(request, 'accounting');
  const buffer = await accountingWorkbook(data, t);
  await getSql()`INSERT INTO audit_log (table_name, row_id, operation, changed_by, after_value)
    VALUES ('admin_actions', ${randomUUID()}, 'INSERT', ${user.email.toLowerCase()},
      ${JSON.stringify({ action: 'accounting_export', year: data.year, count: data.expenses.length, scope: input.ids ? 'selection' : 'year' })}::jsonb)`;
  return new Response(new Uint8Array(buffer), { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="regnskapsforer-${data.year}-${data.expenses.length}-kostnader.xlsx"`,
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
  } });
}

export async function GET(request) {
  try { return await exportResponse(request, { year: new URL(request.url).searchParams.get('year') }); }
  catch (error) { return accountingFailure(error); }
}

export async function POST(request) {
  try {
    const input = await accountingWriteRequest(request, 256 * 1024, 'read');
    if (!Array.isArray(input.ids)) throw new AccountingError('invalidInput');
    return await exportResponse(request, input);
  } catch (error) { return accountingFailure(error); }
}
