const validationErrors = new Set([
  'H-nummer is required', 'Invalid member', 'Invalid member data', 'Invalid member request',
  'Invalid member selection', 'Invalid annual fee', 'No members selected', 'Cadastral number required',
  'Invalid cadastral number', 'Invalid section number', 'Property identifier required', 'Cadastral number required for section',
  'Invalid survey', 'Invalid survey ID', 'Invalid test recipient',
  'Invalid newsletter',
  'Invalid page', 'Invalid file', 'Invalid image', 'File is required',
  'Invalid attachment', 'Invalid attachment order', 'Invalid H-number',
  'Invalid run ID', 'Invalid item ID', 'Primary email change requires verification',
]);
const missingErrors = new Set(['Member not found', 'Member request not found', 'Survey not found', 'Page not found', 'File not found', 'Attachment not found', 'Run not found', 'Item not found', 'Newsletter not found']);
const conflictErrors = new Set(['Mock data cannot be changed', 'Mock data cannot be exported', 'Too many attachments', 'Too many survey attachments', 'Sync already running', 'Run already finished', 'Run still active', 'Member request conflict', 'Member request property unresolved', 'Ownership request already pending', 'Survey not sendable', 'No recipients']);

export async function readJsonObject(request) {
  const input = await request.json();
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new SyntaxError('Invalid JSON object');
  return input;
}

// Keep endpoint-specific authentication semantics, while never presenting an
// unexpected storage/provider failure as a validation error.
export function apiErrorStatus(error, fallback = 500) {
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return 504;
  if (error.message === 'Unauthorized') return fallback === 403 ? 403 : 401;
  if (error.message === 'Forbidden') return 403;
  if (error.message === 'Invalid member session') return 401;
  if (error.name === 'SyntaxError' || validationErrors.has(error.message)) return 400;
  if (missingErrors.has(error.message)) return 404;
  if (conflictErrors.has(error.message) || (error.code || error.cause?.code) === '23505') return 409;
  if (['CMS storage is not configured', 'Matrikkel API not configured', 'Email delivery unavailable'].includes(error.message)) return 503;
  if (error.name === 'MailerServiceError' && Number.isInteger(error.status) && error.status >= 400 && error.status <= 599) return error.status;
  return 500;
}
