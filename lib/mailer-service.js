import { recordMailerFailure } from './mail-failure-log.js';

const API_URL = 'https://api.mailersend.com/v1';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SYSTEM_EMAIL_FOOTER = 'Denne e-posten er sendt fra Medlemsservice i Turufjell Vel.';

export class MailerServiceError extends Error {
  constructor(message, code = 'MAILER_ERROR', status = 500, details = {}) {
    super(message);
    this.name = 'MailerServiceError';
    this.code = code;
    this.status = status;
    if (details.retryAt) this.retryAt = details.retryAt;
    if (details.providerStatus) this.providerStatus = details.providerStatus;
    for (const key of ['providerMessage', 'providerCode', 'providerErrors', 'requestId', 'networkCode']) {
      if (details[key]) this[key] = details[key];
    }
  }
}

function nextUtcDay(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

function retryAtFromResponse(response, dailyQuota) {
  const value = dailyQuota ? response.headers.get('x-apiquota-reset') : response.headers.get('retry-after');
  const now = Date.now();
  if (value) {
    const numeric = Number(value);
    const parsed = Number.isFinite(numeric) && numeric >= 0
      ? numeric >= 1_000_000_000_000 ? numeric
        : numeric >= 1_000_000_000 ? numeric * 1000 : now + Math.max(1, numeric) * 1000
      : Date.parse(value);
    const maximum = now + (dailyQuota ? 26 * 60 * 60_000 : 60 * 60_000);
    if (Number.isFinite(parsed) && parsed > now && parsed <= maximum) return new Date(parsed).toISOString();
  }
  return dailyQuota ? nextUtcDay(new Date(now)) : new Date(now + 60_000).toISOString();
}

async function readProviderBody(response) {
  const raw = await response.text().catch(() => '');
  try {
    const body = JSON.parse(raw);
    return body && typeof body === 'object' ? body : { message: String(body) };
  } catch { return { message: raw.slice(0, 4000) || response.statusText }; }
}

async function providerResponseError(response, message, parsedBody) {
  const body = parsedBody || await readProviderBody(response);
  const details = { providerStatus: response.status, providerMessage: body.message,
    providerCode: String(body.code || '').slice(0, 100) || String(body.message || '').match(/MS\d+/)?.[0],
    providerErrors: body.errors && typeof body.errors === 'object' ? body.errors : undefined,
    requestId: response.headers.get('x-request-id') || response.headers.get('request-id') };
  if (response.status === 429) {
    const serialized = JSON.stringify(body);
    const dailyQuota = response.headers.get('x-apiquota-remaining') === '0' || serialized.includes('MS42901');
    const code = dailyQuota ? 'MAILERSEND_DAILY_QUOTA' : 'MAILERSEND_RATE_LIMIT';
    return new MailerServiceError(
      dailyQuota ? 'MailerSend-dagskvoten er brukt opp.' : 'MailerSend ber oss redusere sendehastigheten.',
      code,
      429,
      { ...details, retryAt: retryAtFromResponse(response, dailyQuota) },
    );
  }
  return new MailerServiceError(`${message} (HTTP ${response.status}).`, 'UPSTREAM', 502, details);
}

export function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

export function getMailerSendConfig(env = process.env) {
  if (env.MAILERSEND_ENABLED !== 'true') throw new MailerServiceError('E-postsending er deaktivert.', 'DISABLED', 503);
  if (!env.MAILERSEND_API_TOKEN) throw new MailerServiceError('MailerSend API-token mangler.', 'CONFIGURATION', 503);
  const fromEmail = normalizeEmail(env.MAILERSEND_FROM_EMAIL);
  if (!fromEmail) throw new MailerServiceError('Gyldig avsenderadresse mangler.', 'CONFIGURATION', 503);
  if (!fromEmail.endsWith('@turufjellvel.no')) throw new MailerServiceError('Avsender må bruke turufjellvel.no.', 'CONFIGURATION', 503);
  if (!env.MAILERSEND_DOMAIN_ID) throw new MailerServiceError('MailerSend domain-ID mangler.', 'CONFIGURATION', 503);
  const replyTo = env.MAILERSEND_REPLY_TO_EMAIL ? normalizeEmail(env.MAILERSEND_REPLY_TO_EMAIL) : fromEmail;
  if (!replyTo) throw new MailerServiceError('Reply-To-adressen er ugyldig.', 'CONFIGURATION', 503);
  return {
    token: env.MAILERSEND_API_TOKEN,
    fromEmail,
    fromName: String(env.MAILERSEND_FROM_NAME || 'Turufjell Vel').trim().slice(0, 100),
    replyTo,
    domainId: String(env.MAILERSEND_DOMAIN_ID),
  };
}

export function isMailerSendConfigured(env = process.env) {
  try { getMailerSendConfig(env); return true; } catch { return false; }
}

export function isMailerSendBulkEnabled(env = process.env) {
  return env.MAILERSEND_BULK_ENABLED === 'true';
}

export function requireMailerSendBulkEnabled(env = process.env) {
  if (!isMailerSendBulkEnabled(env)) {
    throw new MailerServiceError('Masseutsendelse er deaktivert.', 'BULK_DISABLED', 403);
  }
}

function plainTextFromHtml(html) {
  return String(html).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function ensureSystemFooter(html, text) {
  const footerHtml = `<p style="margin:18px 0 0;color:#68736d;font-size:12px">${SYSTEM_EMAIL_FOOTER}</p>`;
  const withHtmlFooter = !html || html.includes(SYSTEM_EMAIL_FOOTER)
    ? html
    : html.includes('</body>') ? html.replace('</body>', `${footerHtml}</body>`) : `${html}${footerHtml}`;
  const withTextFooter = text.includes(SYSTEM_EMAIL_FOOTER) ? text : `${text}\n\n${SYSTEM_EMAIL_FOOTER}`;
  return { html: withHtmlFooter, text: withTextFooter };
}

function safeContext(context, result, messageId) {
  const recipientDomain = normalizeEmail(context?.recipient)?.split('@')[1];
  return {
    event: 'email_delivery', emailType: context?.emailType || 'generic',
    memberId: context?.memberId || undefined, surveyId: context?.surveyId || undefined,
    recipientDomain, providerMessageId: messageId || undefined,
    occurredAt: new Date().toISOString(), result,
  };
}

export function logEmailResult(context, result, messageId) {
  console.info('Email delivery', safeContext(context, result, messageId));
}

export async function sendEmail(message, options = {}) {
  try { return await sendEmailRequest(message, options); }
  catch (error) {
    await recordMailerFailure(error, { ...message.context, recipient: message.to }, {
      env: options.env, sql: options.sql,
      sensitive: [message.to, message.toName, message.subject, message.html, message.text],
    });
    throw error;
  }
}

async function sendEmailRequest({ to, toName, subject, html, text, tags = [], context = {} }, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const config = getMailerSendConfig(env);
  const recipient = normalizeEmail(to);
  if (!recipient) throw new MailerServiceError('Mottakeradressen er ugyldig.', 'INVALID_RECIPIENT', 400);
  const normalizedSubject = String(subject || '').trim();
  if (!normalizedSubject || normalizedSubject.length > 998 || /[\r\n]/.test(normalizedSubject)) {
    throw new MailerServiceError('Emnefeltet er ugyldig.', 'INVALID_SUBJECT', 400);
  }
  const normalizedHtml = typeof html === 'string' && html.trim() ? html.trim() : '';
  const normalizedText = typeof text === 'string' && text.trim() ? text.trim() : plainTextFromHtml(normalizedHtml);
  if (!normalizedHtml && !normalizedText) throw new MailerServiceError('E-posten mangler innhold.', 'INVALID_CONTENT', 400);
  const content = ensureSystemFooter(normalizedHtml, normalizedText);
  const body = {
    from: { email: config.fromEmail, name: config.fromName },
    to: [{ email: recipient, ...(toName ? { name: String(toName).trim().slice(0, 100) } : {}) }],
    reply_to: { email: config.replyTo, name: config.fromName },
    subject: normalizedSubject,
    html: content.html || undefined,
    text: content.text,
    tags: tags.slice(0, 5).map((tag) => String(tag).slice(0, 191)),
    settings: { track_clicks: false, track_opens: false, track_content: false },
  };
  let response;
  try {
    const timeout = AbortSignal.timeout(30_000);
    response = await fetchImpl(`${API_URL}/email`, {
      method: 'POST', signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason || error;
    logEmailResult({ ...context, recipient }, 'network_error');
    throw new MailerServiceError('MailerSend kunne ikke nås.', 'UPSTREAM', 502, {
      networkCode: error.cause?.code || error.code || error.name,
      providerMessage: error.cause?.message || error.message,
    });
  }
  const messageId = response.headers.get('x-message-id');
  let result;
  if (response.ok && !messageId) {
    result = await readProviderBody(response);
    if (result.warnings?.some((warning) => warning.type === 'ALL_SUPPRESSED')) {
      logEmailResult({ ...context, recipient }, 'suppressed');
      throw new MailerServiceError('Mottakeren er undertrykt hos MailerSend.', 'SUPPRESSED', 409,
        { providerStatus: response.status, providerCode: 'ALL_SUPPRESSED', requestId: response.headers.get('x-request-id') });
    }
  }
  if (!response.ok || !messageId) {
    logEmailResult({ ...context, recipient }, `provider_error_${response.status}`);
    throw await providerResponseError(response, response.ok ? 'MailerSend returnerte ingen meldings-ID' : 'MailerSend avviste forespørselen', result);
  }
  logEmailResult({ ...context, recipient }, 'accepted', messageId);
  return { messageId };
}

export async function getMailerSendSuppressions(options = {}) {
  try { return await fetchMailerSendSuppressions(options); }
  catch (error) {
    await recordMailerFailure(error, { ...options.context, operation: 'suppression_lookup' }, options);
    throw error;
  }
}

async function fetchMailerSendSuppressions(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const config = getMailerSendConfig(env);
  const emails = new Set();
  const domains = new Set();
  for (const type of ['blocklist', 'hard-bounces', 'spam-complaints', 'unsubscribes', 'on-hold-list']) {
    for (let page = 1; page <= 50; page += 1) {
      const query = new URLSearchParams({ domain_id: config.domainId, limit: '100', page: String(page) });
      let response;
      try {
        const timeout = AbortSignal.timeout(30_000);
        response = await fetchImpl(`${API_URL}/suppressions/${type}?${query}`, {
          signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
          headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/json' },
        });
      } catch (error) {
        if (options.signal?.aborted) throw options.signal.reason || error;
        throw new MailerServiceError('Kunne ikke kontrollere MailerSend-undertrykking.', 'UPSTREAM', 502,
          { networkCode: error.cause?.code || error.code || error.name, providerMessage: error.cause?.message || error.message });
      }
      if (response.status === 403) {
        const detail = await providerResponseError(response, 'MailerSend-tokenet mangler lesetilgang til suppressions');
        detail.code = 'SUPPRESSION_PERMISSION'; detail.status = 503; throw detail;
      }
      if (!response.ok) throw await providerResponseError(response, 'MailerSend-undertrykking feilet');
      const data = (await response.json().catch(() => ({}))).data || [];
      for (const item of data) {
        const email = normalizeEmail(item.recipient?.email || item.email);
        if (email) emails.add(email);
        const domainMatch = String(item.pattern || '').match(/^(?:\.\*|\*)@([^*\s]+)$/);
        if (domainMatch) domains.add(domainMatch[1].toLowerCase());
      }
      if (data.length < 100) break;
    }
  }
  return { emails, domains };
}

export function isSuppressedRecipient(email, suppressions) {
  const normalized = normalizeEmail(email);
  if (!normalized) return true;
  return suppressions.emails.has(normalized) || suppressions.domains.has(normalized.split('@')[1]);
}
