import { surveyAnswerLabel } from './survey-questions.js';
import { getEmailI18n } from './i18n/email.js';
import { surveyResultsSections } from '../data/survey-results-message.js';

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export const SYSTEM_EMAIL_FOOTER = getEmailI18n().t('footer');

export function formatNorwegianDateTime(value, locale = 'nb') {
  const raw = String(value || '');
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/);
  const date = dateOnly
    ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return raw;
  const formatted = new Intl.DateTimeFormat(getEmailI18n(locale).formatLocale, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    timeZone: dateOnly ? 'UTC' : 'Europe/Oslo',
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function renderEmailBrand(baseUrl) {
  const safeLogo = escapeHtml(new URL('/Turufjell_liggende_VEL_logo_brun.svg', baseUrl).toString());
  return `<img src="${safeLogo}" width="240" height="27" alt="Turufjell Vel" style="display:block;width:240px;height:auto;max-width:100%">`;
}

export function renderSurveyInvitationEmail({ surveyTitle, endsOn, surveyUrl, baseUrl, isTest = false, singleResponsePerProperty = true, propertyRecipients = [], locale = 'nb' }) {
  const { t } = getEmailI18n(locale);
  const safeTitle = escapeHtml(surveyTitle);
  const safeUrl = escapeHtml(surveyUrl);
  const emailBrand = renderEmailBrand(baseUrl);
  const deadline = formatNorwegianDateTime(endsOn, locale);
  const testNotice = isTest ? `<p style="margin:0 0 20px;padding:12px 14px;border-radius:8px;background:#E8D288;color:#493F39"><strong>${t('testLabel')}</strong> ${t('previewNotice')}</p>` : '';
  const actionLabel = isTest ? t('preview') : t('open');
  const html = `<!doctype html><html lang="${getEmailI18n(locale).locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${safeTitle}</title></head><body style="margin:0;background:#EBEBDE;color:#493F39;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#EBEBDE"><tr><td align="center" style="padding:28px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #D9D5C6;border-radius:14px"><tr><td style="padding:28px 32px 16px">${emailBrand}</td></tr><tr><td style="padding:12px 32px 34px">${testNotice}<p style="margin:0 0 10px;color:#955E6E;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em">${t('survey')}</p><h1 style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:28px;font-weight:400;line-height:1.25;color:#493F39">${safeTitle}</h1><p style="margin:0 0 16px;font-size:16px;line-height:1.65">${t('invitationBody', { deadline: '<strong>' + escapeHtml(deadline) + '</strong>' })}</p><p style="margin:26px 0"><a href="${safeUrl}" style="display:inline-block;padding:14px 22px;border-radius:8px;background:#955E6E;color:#fff;text-decoration:none;font-weight:bold">${actionLabel}</a></p><p style="margin:0 0 8px;color:#6F645E;font-size:13px;line-height:1.5">${t('buttonHelp')}</p><p style="margin:0;overflow-wrap:anywhere;font-size:13px;line-height:1.5"><a href="${safeUrl}" style="color:#5A2636">${safeUrl}</a></p></td></tr></table><p style="margin:18px 0 0;color:#6F645E;font-size:12px">${t('footer')}</p></td></tr></table></body></html>`;
  const text = `${isTest ? `${t('testPrefix')}${t('previewNotice')}\n\n` : ''}Turufjell Vel\n\n${surveyTitle}\n\n${t('invitationBody', { deadline })}\n\n${actionLabel}:\n${surveyUrl}\n\n${t('footer')}`;
  const recipients = [...new Set(propertyRecipients)];
  const policy = singleResponsePerProperty
    ? t('propertyPolicy')
    : t('recipientPolicy');
  const browserHelp = t('browserHelp');
  const notice = `${recipients.length > 1 ? `${t('recipients', { recipients: recipients.join(', ') })}\n\n` : ''}${policy}\n\n${browserHelp}`;
  return { locale, subject: `${isTest ? '[TEST] ' : ''}${t('invitation', { title: surveyTitle })}`,
    html: html.replace('</h1>', `</h1><p style="line-height:1.65">${escapeHtml(notice).replaceAll('\n', '<br>')}</p>`),
    text: text.replace(`\n\n${actionLabel}:`, `\n\n${notice}\n\n${actionLabel}:`) };
}


import { SURVEY_CHART_COLORS as resultChartColors } from './survey-chart-style.js';

function resultParagraphs(text) {
  return text.split('\n\n').map((paragraph) => paragraph.startsWith('• ')
    ? `<ul style="margin:0 0 18px;padding-left:24px;font-size:16px;line-height:1.65">${paragraph.split('\n').map((line) => `<li style="margin:0 0 8px;padding-left:2px">${escapeHtml(line.replace(/^•\s*/, ''))}</li>`).join('')}</ul>`
    : `<p style="margin:0 0 18px;font-size:16px;line-height:1.65">${escapeHtml(paragraph)}</p>`).join('');
}

function resultDonut(question, t) {
  const options = question.options || [{ value: 'ja', label: t('ja') }, { value: 'nei', label: t('nei') }, { value: 'usikker', label: t('usikker') }];
  let offset = 0;
  const segments = options.map((option, index) => {
    const percent = Number(question.percentages?.[option.value] || 0);
    const length = Math.max(0, Math.min(100, percent));
    const circle = `<circle cx="50" cy="50" r="38" fill="none" stroke="${resultChartColors[index % resultChartColors.length]}" stroke-width="16" stroke-dasharray="${length} ${100 - length}" stroke-dashoffset="${-offset}" pathLength="100" transform="rotate(-90 50 50)"/>`;
    offset += length;
    return circle;
  }).join('');
  const legend = options.map((option, index) => `<tr><td style="padding:2px 8px 2px 0;font-size:13px;line-height:1.4"><span style="display:inline-block;width:9px;height:9px;margin-right:6px;border-radius:50%;background:${resultChartColors[index % resultChartColors.length]}"></span>${escapeHtml(option.label || option.value)}</td><td align="right" style="padding:2px 0;font-size:13px;font-weight:bold">${String(question.percentages?.[option.value] || 0).replace('.', ',')} %</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0;border:1px solid #D9D5C6;border-radius:10px"><tr><td style="padding:16px"><p style="margin:0 0 12px;font-size:15px;line-height:1.45;font-weight:bold">${escapeHtml(question.text)}</p><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="padding-right:16px"><svg width="112" height="112" viewBox="0 0 100 100" role="img" aria-label="${escapeHtml(question.text)}"><circle cx="50" cy="50" r="38" fill="none" stroke="#e4e4e7" stroke-width="16"/>${segments}<text x="50" y="48" text-anchor="middle" font-size="17" font-weight="700" fill="#18181b">${question.answered_count || 0}</text><text x="50" y="62" text-anchor="middle" font-size="8" fill="#71717a">${t('answers')}</text></svg></td><td><table role="presentation" cellspacing="0" cellpadding="0">${legend}</table></td></tr></table></td></tr></table>`;
}

export function renderSurveyResultsEmail({ results, baseUrl, isTest = false, locale = 'nb' }) {
  const { t } = getEmailI18n(locale);
  const testNotice = isTest ? `<p style="margin:0 0 20px;padding:12px 14px;border-radius:8px;background:#E8D288;color:#493F39"><strong>${t('testLabel')}</strong> ${t('resultsNotice')}</p>` : '';
  const charts = results?.versions?.flatMap((version) => version.questions || []).filter((question) => !question.multiple).map((question) => resultDonut(question, t)).join('') || '';
  const htmlSections = surveyResultsSections.map(([heading, text], index) => `<h2 style="margin:${index ? '30px' : '0'} 0 12px;font-size:21px;font-weight:600;line-height:1.3;color:#493F39">${heading}</h2>${resultParagraphs(text)}${index === 0 ? '<!--survey-results-charts-->' : ''}${index === 0 && charts ? `<h2 style="margin:30px 0 12px;font-size:21px;font-weight:600;line-height:1.3;color:#493F39">${t('distribution')}</h2>${charts}` : ''}`).join('') + `<p style="margin:28px 0 0;font-size:16px;line-height:1.65"><strong>${t('signature')}</strong></p>`;
  const textSections = surveyResultsSections.map(([heading, text]) => `${heading}\n\n${text}`).join('\n\n') + `\n\n${t('signature')}`;
  const subject = `${isTest ? '[TEST] ' : ''}${t('resultsSubject')}`;
  return {
    locale, subject,
    html: `<!doctype html><html lang="${getEmailI18n(locale).locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#EBEBDE;color:#493F39;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#EBEBDE"><tr><td align="center" style="padding:28px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #D9D5C6;border-radius:14px"><tr><td style="padding:28px 32px 16px">${renderEmailBrand(baseUrl)}</td></tr><tr><td style="padding:12px 32px 34px">${testNotice}<p style="margin:0 0 10px;color:#955E6E;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em">${t('survey')}</p><h1 style="margin:0 0 22px;font-size:28px;font-weight:400;line-height:1.25;color:#493F39">${t('resultsSubject')}</h1>${htmlSections}</td></tr></table><p style="margin:18px 0 0;color:#6F645E;font-size:12px">${t('footer')}</p></td></tr></table></body></html>`,
    text: `${isTest ? `${t('testPrefix')}${t('resultsNotice')}\n\n` : ''}${textSections}\n\n${t('footer')}`,
  };
}

export function renderSurveyReceiptEmail({ surveyTitle, hNumber, submittedBy, accepted, effectiveRespondent, questions, answers, attemptedQuestions, attemptedAnswers, baseUrl, locale = 'nb' }) {
  const { t } = getEmailI18n(locale);
  const summary = (items, values) => items.map((question) => `${question.number || ''}. ${question.text}\n${surveyAnswerLabel(question, values[question.id])}`).join('\n\n');
  const status = accepted ? t('accepted') : t('notAccepted');
  const content = `${t('receipt', { title: surveyTitle })}\n${t('plot', { number: hNumber || '–' })}\n${t('submittedBy', { email: submittedBy })}\n\n${status}\n\n${t('effectiveRespondent', { email: effectiveRespondent || t('previousRecipient') })}\n\n${summary(questions, answers)}${!accepted ? `\n\n${t('subsequent')}\n${summary(attemptedQuestions, attemptedAnswers)}` : ''}`;
  return { locale, subject: `${t('receipt', { title: surveyTitle })}`,
    text: `${content}\n\n${t('footer')}`,
    html: `<!doctype html><html lang="${getEmailI18n(locale).locale}"><head><meta charset="utf-8"><title>${escapeHtml(surveyTitle)}</title></head><body style="font-family:Arial,sans-serif;color:#493F39"><main style="max-width:620px;margin:auto;padding:24px">${renderEmailBrand(baseUrl)}<p style="white-space:pre-line;line-height:1.6">${escapeHtml(content)}</p><p>${t('footer')}</p></main></body></html>` };
}

function renderSecureLinkEmail({ subject, eyebrow, heading, body, actionLabel, actionUrl, baseUrl, locale = 'nb', validity = getEmailI18n(locale).t('validity') }) {
  const { t } = getEmailI18n(locale);
  const safeSubject = escapeHtml(subject);
  const safeEyebrow = escapeHtml(eyebrow);
  const safeHeading = escapeHtml(heading);
  const safeBody = escapeHtml(body);
  const safeLabel = escapeHtml(actionLabel);
  const safeUrl = escapeHtml(actionUrl);
  const emailBrand = renderEmailBrand(baseUrl);
  const safeValidity = escapeHtml(validity);
  const html = `<!doctype html><html lang="${getEmailI18n(locale).locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${safeSubject}</title></head><body style="margin:0;background:#EBEBDE;color:#493F39;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#EBEBDE"><tr><td align="center" style="padding:28px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #D9D5C6;border-radius:14px"><tr><td style="padding:28px 32px 16px">${emailBrand}</td></tr><tr><td style="padding:12px 32px 34px"><p style="margin:0 0 10px;color:#955E6E;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em">${safeEyebrow}</p><h1 style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:28px;font-weight:400;line-height:1.25;color:#493F39">${safeHeading}</h1><p style="margin:0 0 16px;font-size:16px;line-height:1.65">${safeBody}</p><p style="margin:26px 0"><a href="${safeUrl}" style="display:inline-block;padding:14px 22px;border-radius:8px;background:#955E6E;color:#fff;text-decoration:none;font-weight:bold">${safeLabel}</a></p><p style="margin:0 0 8px;color:#6F645E;font-size:13px;line-height:1.5">${t('secureLinkHelp', { validity: safeValidity })}</p><p style="margin:0;overflow-wrap:anywhere;font-size:13px;line-height:1.5"><a href="${safeUrl}" style="color:#5A2636">${safeUrl}</a></p></td></tr></table><p style="margin:18px 0 0;color:#6F645E;font-size:12px">${t('ignore')}</p><p style="margin:8px 0 0;color:#6F645E;font-size:12px">${t('footer')}</p></td></tr></table></body></html>`;
  const text = `Turufjell Vel\n\n${heading}\n\n${body}\n\n${actionLabel}:\n${actionUrl}\n\n${t('secureLinkTextHelp', { validity })} ${t('ignore')}\n\n${t('footer')}`;
  return { locale, subject, html, text };
}

function localizedLinkEmail(kind, { actionUrl, baseUrl, locale = 'nb' }, eyebrowKey = `${kind}.eyebrow`) {
  const { t } = getEmailI18n(locale);
  return renderSecureLinkEmail({ subject: t(`${kind}.subject`), eyebrow: t(eyebrowKey),
    heading: t(`${kind}.heading`), body: t(`${kind}.body`), actionLabel: t(`${kind}.action`),
    actionUrl, baseUrl, locale });
}

export function renderMemberAccessEmail(options) { return localizedLinkEmail('access', options); }
export function renderMembershipVerificationEmail(options) { return localizedLinkEmail('membership', options); }
export function renderEmailChangeConfirmationEmail(options) {
  return localizedLinkEmail(options.stage === 'old' ? 'changeOld' : 'changeNew', options, 'securityCheck');
}

export function renderEmailChangeNoticeEmail({ baseUrl, completed, locale = 'nb' }) {
  const { t } = getEmailI18n(locale);
  const subject = completed ? t('changed.subject') : t('changeStarted.subject');
  const heading = completed ? t('changed.heading') : t('changeStarted.heading');
  const body = completed
    ? t('changed.body')
    : t('changeStarted.body');
  const safeSubject = escapeHtml(subject);
  const emailBrand = renderEmailBrand(baseUrl);
  const html = `<!doctype html><html lang="${getEmailI18n(locale).locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${safeSubject}</title></head><body style="margin:0;background:#EBEBDE;color:#493F39;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#EBEBDE"><tr><td align="center" style="padding:28px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #D9D5C6;border-radius:14px"><tr><td style="padding:28px 32px 16px">${emailBrand}</td></tr><tr><td style="padding:12px 32px 34px"><p style="margin:0 0 10px;color:#955E6E;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em">${t('securityAlert')}</p><h1 style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:28px;font-weight:400;line-height:1.25;color:#493F39">${heading}</h1><p style="margin:0;font-size:16px;line-height:1.65">${body}</p></td></tr></table><p style="margin:18px 0 0;color:#6F645E;font-size:12px">${t('footer')}</p></td></tr></table></body></html>`;
  return { locale, subject, html, text: `Turufjell Vel\n\n${heading}\n\n${body}\n\n${t('footer')}` };
}
