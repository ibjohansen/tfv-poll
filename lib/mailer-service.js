const API_URL = 'https://api.mailersend.com/v1';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SYSTEM_EMAIL_FOOTER = 'Denne e-posten er sendt fra Medlemsservice i Turufjell Vel.';

export class MailerServiceError extends Error {
  constructor(message, code = 'MAILER_ERROR', status = 500) {
    super(message);
    this.name = 'MailerServiceError';
    this.code = code;
    this.status = status;
  }
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

export async function sendEmail({ to, toName, subject, html, text, tags = [], context = {} }, options = {}) {
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
    response = await fetchImpl(`${API_URL}/email`, {
      method: 'POST', signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    logEmailResult({ ...context, recipient }, 'network_error');
    throw new MailerServiceError('MailerSend kunne ikke nås.', 'UPSTREAM', 502);
  }
  const messageId = response.headers.get('x-message-id');
  if (response.ok && !messageId) {
    const result = await response.json().catch(() => ({}));
    if (result.warnings?.some((warning) => warning.type === 'ALL_SUPPRESSED')) {
      logEmailResult({ ...context, recipient }, 'suppressed');
      throw new MailerServiceError('Mottakeren er undertrykt hos MailerSend.', 'SUPPRESSED', 409);
    }
  }
  if (!response.ok || !messageId) {
    logEmailResult({ ...context, recipient }, `provider_error_${response.status}`);
    throw new MailerServiceError(`MailerSend avviste forespørselen (HTTP ${response.status}).`, 'UPSTREAM', 502);
  }
  logEmailResult({ ...context, recipient }, 'accepted', messageId);
  return { messageId };
}

export async function getMailerSendSuppressions(options = {}) {
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
        response = await fetchImpl(`${API_URL}/suppressions/${type}?${query}`, {
          signal: AbortSignal.timeout(30_000), headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/json' },
        });
      } catch { throw new MailerServiceError('Kunne ikke kontrollere MailerSend-undertrykking.', 'UPSTREAM', 502); }
      if (response.status === 403) {
        throw new MailerServiceError('MailerSend-tokenet mangler lesetilgang til suppressions.', 'SUPPRESSION_PERMISSION', 503);
      }
      if (!response.ok) throw new MailerServiceError(`MailerSend-undertrykking feilet (HTTP ${response.status}).`, 'UPSTREAM', 502);
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
