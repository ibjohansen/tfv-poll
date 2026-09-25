import { getAccountingOverview, saveAccountingYear, createAccountingExpenses, updateAccountingExpense, updateAccountingStatuses } from '@/lib/accounting';
import { AccountingError } from '@/lib/accounting-validation';
import { accountingResponse, accountingFailure, accountingWriteRequest } from '@/lib/accounting-http';

export const runtime = 'nodejs';

export async function GET(request) {
  try { return accountingResponse({ ok: true, data: await getAccountingOverview(new URL(request.url).searchParams.get('year')) }); }
  catch (error) { return accountingFailure(error); }
}

export async function POST(request) {
  try {
    const input = await accountingWriteRequest(request);
    let result;
    if (input.operation === 'year') result = await saveAccountingYear(input);
    else if (input.operation === 'batch') result = await createAccountingExpenses(input.year, input);
    else if (input.operation === 'expense') result = await updateAccountingExpense(input.year, input);
    else if (input.operation === 'status') result = await updateAccountingStatuses(input.year, input);
    else throw new AccountingError('invalidInput');
    return accountingResponse({ ok: true, result });
  } catch (error) { return accountingFailure(error); }
}
