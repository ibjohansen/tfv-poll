import { importAnnualFeeStatuses } from '@/lib/accounting-fees';
import { accountingFailure, accountingResponse, accountingWriteRequest } from '@/lib/accounting-http';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const form = await accountingWriteRequest(request, 1100 * 1024);
    const result = await importAnnualFeeStatuses({ year: form.get('year'), kind: form.get('kind'), date: form.get('date'),
      apply: form.get('apply') === 'true', file: form.get('file') });
    return accountingResponse({ ok: true, ...result });
  } catch (error) { return accountingFailure(error); }
}
