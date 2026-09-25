import { uploadAccountingReceipt } from '@/lib/accounting';
import { accountingResponse, accountingFailure, accountingWriteRequest } from '@/lib/accounting-http';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const form = await accountingWriteRequest(request, 4 * 1024 * 1024);
    const file = await uploadAccountingReceipt(form.get('year'), form.get('file'));
    return accountingResponse({ ok: true, file }, 201);
  } catch (error) { return accountingFailure(error); }
}
