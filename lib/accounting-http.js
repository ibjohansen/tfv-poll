import { requirePermission } from './admin-access.js';
import { apiErrorStatus } from './api-errors.js';
import { isSameOriginRequest } from './request-origin.js';
import { AccountingError } from './accounting-validation.js';

export function accountingResponse(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export function accountingFailure(error) {
  if (error.code === 'P0001' && ['financeYearClosed', 'useDocumentedPayments', 'campaignAmountLocked'].includes(error.message)) return accountingResponse({ ok: false, code: error.message }, 409);
  const status = error instanceof AccountingError ? error.status : apiErrorStatus(error);
  const code = error instanceof AccountingError ? error.code
    : status === 409 ? 'duplicate' : status === 401 || status === 403 ? 'accessDenied'
      : status === 400 ? 'invalidInput' : 'unavailable';
  return accountingResponse({ ok: false, code }, status);
}

export async function accountingWriteRequest(request, maximum = 256 * 1024, permission = 'members') {
  await requirePermission(permission);
  if (!isSameOriginRequest(request)) throw new AccountingError('accessDenied', 403);
  if (!request.body || Number(request.headers.get('content-length') || 0) > maximum) throw new AccountingError('tooLarge', 413);
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) { await reader.cancel(); throw new AccountingError('tooLarge', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = Buffer.concat(chunks);
  if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
    return new Request(request.url, { method: 'POST', headers: request.headers, body }).formData();
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new AccountingError('invalidInput', 415);
  const input = JSON.parse(body.toString('utf8'));
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AccountingError('invalidInput');
  return input;
}
