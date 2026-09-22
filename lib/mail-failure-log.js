import { randomUUID } from 'node:crypto';

function cleanText(value, sensitive, limit = 1000, redactTokens = true) {
  if (typeof value !== 'string') return null;
  let text = value;
  for (const secret of sensitive) {
    if (typeof secret === 'string' && secret.length >= 3) text = text.replaceAll(secret, '[redacted]');
  }
  text = text.replace(/https?:\/\/[^\s<>"']+/gi, '[url]')
    .replace(/[^\s<>"']+@[^\s<>"']+\.[^\s<>"']+/g, '[email]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ');
  return (redactTokens ? text.replace(/[A-Za-z0-9_+/=-]{32,}/g, '[token]') : text).slice(0, limit);
}

export function mailFailureDetails(error, context = {}, options = {}) {
  const env = options.env || process.env;
  const sensitive = [...Object.entries(env).filter(([key]) => /SECRET|TOKEN|PASSWORD|DATABASE_URL/.test(key)).map(([, value]) => value),
    ...(options.sensitive || []), context.recipient];
  const clean = (value, limit) => cleanText(value, sensitive, limit);
  const errors = Object.entries(error.providerErrors || {}).slice(0, 10).map(([field, messages]) => ({
    field: clean(field, 100), messages: (Array.isArray(messages) ? messages : [messages]).slice(0, 3).map((message) => clean(message, 500)).filter(Boolean),
  }));
  const id = randomUUID();
  return {
    action: 'email_send_failed', error_id: id,
    status: error.code === 'SUPPRESSED' ? 'suppressed' : 'failed',
    provider: 'mailersend', operation: context.operation || 'send',
    email_type: context.emailType || 'unknown',
    mail_id: context.deliveryId ? `invitation:${context.deliveryId}` : context.receiptId ? `receipt:${context.receiptId}` : null,
    survey_id: context.surveyId || null, member_id: context.memberId || null,
    newsletter_id: context.newsletterId || null, campaign_id: context.campaignId || null,
    code: clean(error.code || 'SEND_FAILED', 100),
    message: clean(error.message), provider_message: clean(error.providerMessage),
    provider_code: clean(error.providerCode, 100), http_status: Number.isInteger(error.providerStatus) ? error.providerStatus : null,
    request_id: cleanText(error.requestId, sensitive, 200, false), network_code: clean(error.networkCode, 100),
    retry_at: error.retryAt || null, validation_errors: errors,
  };
}

export async function recordMailerFailure(error, context, options = {}) {
  const detail = mailFailureDetails(error, context, options);
  error.errorId = detail.error_id;
  // Structured fallback remains available if the database itself is unavailable.
  console.error('Email failure', detail);
  const env = options.env || process.env;
  if (!options.sql && !env.DATABASE_URL) return;
  try {
    const sql = options.sql || (await import('./db.js')).getSql();
    await sql`INSERT INTO audit_log (table_name, row_id, operation, changed_by, after_value)
      VALUES ('email_events', ${detail.error_id}, 'INSERT', 'system:mailersend', ${JSON.stringify(detail)}::jsonb)`;
  } catch {
    console.error('Email failure audit storage unavailable', { errorId: detail.error_id });
  }
}
