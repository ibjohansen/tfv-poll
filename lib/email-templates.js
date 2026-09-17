import { surveyAnswerLabel } from './survey-questions.js';

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export const SYSTEM_EMAIL_FOOTER = 'Denne e-posten er sendt fra Medlemsservice i Turufjell Vel.';

export function formatNorwegianDateTime(value) {
  const raw = String(value || '');
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/);
  const date = dateOnly
    ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return raw;
  const formatted = new Intl.DateTimeFormat('nb-NO', {
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

export function renderSurveyInvitationEmail({ surveyTitle, endsOn, surveyUrl, baseUrl, isTest = false, singleResponsePerProperty = true, propertyRecipients = [] }) {
  const safeTitle = escapeHtml(surveyTitle);
  const safeUrl = escapeHtml(surveyUrl);
  const emailBrand = renderEmailBrand(baseUrl);
  const deadline = formatNorwegianDateTime(endsOn);
  const testNotice = isTest ? '<p style="margin:0 0 20px;padding:12px 14px;border-radius:8px;background:#E8D288;color:#493F39"><strong>Testmelding:</strong> Knappen bruker ikke en personlig medlemslenke.</p>' : '';
  const html = `<!doctype html><html lang="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${safeTitle}</title></head><body style="margin:0;background:#EBEBDE;color:#493F39;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#EBEBDE"><tr><td align="center" style="padding:28px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #D9D5C6;border-radius:14px"><tr><td style="padding:28px 32px 16px">${emailBrand}</td></tr><tr><td style="padding:12px 32px 34px">${testNotice}<p style="margin:0 0 10px;color:#955E6E;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em">Medlemsundersøkelse</p><h1 style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:28px;font-weight:400;line-height:1.25;color:#493F39">${safeTitle}</h1><p style="margin:0 0 16px;font-size:16px;line-height:1.65">Turufjell Vel inviterer deg til å svare på undersøkelsen. Svarfristen er <strong>${escapeHtml(deadline)}</strong>.</p><p style="margin:26px 0"><a href="${safeUrl}" style="display:inline-block;padding:14px 22px;border-radius:8px;background:#955E6E;color:#fff;text-decoration:none;font-weight:bold">Åpne undersøkelsen</a></p><p style="margin:0 0 8px;color:#6F645E;font-size:13px;line-height:1.5">Hvis knappen ikke virker, kopier denne adressen til nettleseren:</p><p style="margin:0;overflow-wrap:anywhere;font-size:13px;line-height:1.5"><a href="${safeUrl}" style="color:#5A2636">${safeUrl}</a></p></td></tr></table><p style="margin:18px 0 0;color:#6F645E;font-size:12px">${SYSTEM_EMAIL_FOOTER}</p></td></tr></table></body></html>`;
  const text = `${isTest ? 'TESTMELDING – lenken er ikke en personlig medlemslenke.\n\n' : ''}Turufjell Vel\n\n${surveyTitle}\n\nTurufjell Vel inviterer deg til å svare på undersøkelsen. Svarfristen er ${deadline}.\n\nÅpne undersøkelsen:\n${surveyUrl}\n\n${SYSTEM_EMAIL_FOOTER}`;
  const recipients = [...new Set(propertyRecipients)];
  const policy = singleResponsePerProperty
    ? 'Det registreres kun ETT svar per tomt. Den første innsendte besvarelsen gjelder. Hoved-e-post får kvittering med spørsmål, svar og hvilken e-postadresse som sendte det tellende svaret.'
    : 'Hver invitert e-postadresse kan sende inn én selvstendig besvarelse. Hoved-e-post får kvittering på innsendte besvarelser.';
  const notice = `${recipients.length > 1 ? `Denne invitasjonen sendes til følgende mottakere på samme tomt: ${recipients.join(', ')}. Flere mottakere får varsel.\n\n` : ''}${policy}`;
  return { subject: `${isTest ? '[TEST] ' : ''}Invitasjon: ${surveyTitle}`,
    html: html.replace('</h1>', `</h1><p style="line-height:1.65">${escapeHtml(notice).replaceAll('\n', '<br>')}</p>`),
    text: text.replace('\n\nÅpne undersøkelsen:', `\n\n${notice}\n\nÅpne undersøkelsen:`) };
}

export function renderSurveyReceiptEmail({ surveyTitle, hNumber, submittedBy, accepted, effectiveRespondent, questions, answers, attemptedQuestions, attemptedAnswers, baseUrl }) {
  const summary = (items, values) => items.map((question) => `${question.number || ''}. ${question.text}\n${surveyAnswerLabel(question, values[question.id])}`).join('\n\n');
  const status = accepted ? 'Besvarelsen er registrert og er tellende.' : 'Innsendingen er mottatt, men erstatter ikke det første svaret. Kun den første besvarelsen er tellende for tomten.';
  const content = `Kvittering: ${surveyTitle}\nTomt: ${hNumber || '–'}\nInnsendt av: ${submittedBy}\n\n${status}\n\nTellende besvarelse fra: ${effectiveRespondent || 'tidligere registrert mottaker'}\n\n${summary(questions, answers)}${!accepted ? `\n\nSenere innsendt besvarelse (ikke tellende):\n${summary(attemptedQuestions, attemptedAnswers)}` : ''}`;
  return { subject: `Kvittering: ${surveyTitle}`,
    text: `${content}\n\n${SYSTEM_EMAIL_FOOTER}`,
    html: `<!doctype html><html lang="nb"><head><meta charset="utf-8"><title>${escapeHtml(surveyTitle)}</title></head><body style="font-family:Arial,sans-serif;color:#493F39"><main style="max-width:620px;margin:auto;padding:24px">${renderEmailBrand(baseUrl)}<p style="white-space:pre-line;line-height:1.6">${escapeHtml(content)}</p><p>${SYSTEM_EMAIL_FOOTER}</p></main></body></html>` };
}

function renderSecureLinkEmail({ subject, eyebrow, heading, body, actionLabel, actionUrl, baseUrl, validity = '15 minutter' }) {
  const safeSubject = escapeHtml(subject);
  const safeEyebrow = escapeHtml(eyebrow);
  const safeHeading = escapeHtml(heading);
  const safeBody = escapeHtml(body);
  const safeLabel = escapeHtml(actionLabel);
  const safeUrl = escapeHtml(actionUrl);
  const emailBrand = renderEmailBrand(baseUrl);
  const safeValidity = escapeHtml(validity);
  const html = `<!doctype html><html lang="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${safeSubject}</title></head><body style="margin:0;background:#EBEBDE;color:#493F39;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#EBEBDE"><tr><td align="center" style="padding:28px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #D9D5C6;border-radius:14px"><tr><td style="padding:28px 32px 16px">${emailBrand}</td></tr><tr><td style="padding:12px 32px 34px"><p style="margin:0 0 10px;color:#955E6E;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em">${safeEyebrow}</p><h1 style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:28px;font-weight:400;line-height:1.25;color:#493F39">${safeHeading}</h1><p style="margin:0 0 16px;font-size:16px;line-height:1.65">${safeBody}</p><p style="margin:26px 0"><a href="${safeUrl}" style="display:inline-block;padding:14px 22px;border-radius:8px;background:#955E6E;color:#fff;text-decoration:none;font-weight:bold">${safeLabel}</a></p><p style="margin:0 0 8px;color:#6F645E;font-size:13px;line-height:1.5">Lenken er personlig, varer i ${safeValidity} og skal ikke videresendes. Hvis knappen ikke virker, kopier denne adressen:</p><p style="margin:0;overflow-wrap:anywhere;font-size:13px;line-height:1.5"><a href="${safeUrl}" style="color:#5A2636">${safeUrl}</a></p></td></tr></table><p style="margin:18px 0 0;color:#6F645E;font-size:12px">Har du ikke bedt om dette, kan du se bort fra meldingen.</p><p style="margin:8px 0 0;color:#6F645E;font-size:12px">${SYSTEM_EMAIL_FOOTER}</p></td></tr></table></body></html>`;
  const text = `Turufjell Vel\n\n${heading}\n\n${body}\n\n${actionLabel}:\n${actionUrl}\n\nLenken er personlig, varer i ${validity} og skal ikke videresendes. Hvis knappen ikke virker, kan du kopiere adressen ovenfor og lime den inn i nettleseren. Har du ikke bedt om dette, kan du se bort fra meldingen.\n\n${SYSTEM_EMAIL_FOOTER}`;
  return { subject, html, text };
}

export function renderMemberAccessEmail({ actionUrl, baseUrl }) {
  return renderSecureLinkEmail({
    subject: 'Din sikre tilgang til medlemsopplysninger',
    eyebrow: 'Mine medlemsopplysninger',
    heading: 'Se og oppdater opplysningene dine',
    body: 'Vi har mottatt en forespørsel om tilgang til medlemsopplysningene som er registrert hos Turufjell Vel.',
    actionLabel: 'Åpne medlemsopplysningene',
    actionUrl,
    baseUrl,
  });
}

export function renderMembershipVerificationEmail({ actionUrl, baseUrl }) {
  return renderSecureLinkEmail({
    subject: 'Bekreft innmelding i Turufjell Vel',
    eyebrow: 'Innmelding',
    heading: 'Bekreft e-postadressen din',
    body: 'Vi har mottatt en forespørsel om å melde inn en ny tomt. Bekreft e-postadressen slik at saken merkes som bekreftet for saksbehandleren.',
    actionLabel: 'Bekreft innmeldingen',
    actionUrl,
    baseUrl,
  });
}

export function renderEmailChangeConfirmationEmail({ actionUrl, baseUrl, stage }) {
  const oldAddress = stage === 'old';
  return renderSecureLinkEmail({
    subject: oldAddress ? 'Bekreft endring av hoved-e-post' : 'Bekreft den nye hoved-e-postadressen',
    eyebrow: 'Sikkerhetskontroll',
    heading: oldAddress ? 'Bekreft at du ba om endringen' : 'Bekreft den nye adressen',
    body: oldAddress
      ? 'Noen har bedt om å endre hoved-e-post for medlemskapet. Bekreft forespørselen før vi sender en egen kontroll til den nye adressen.'
      : 'Den gamle adressen er kontrollert. Bekreft at du har tilgang til den nye adressen før den tas i bruk.',
    actionLabel: oldAddress ? 'Bekreft forespørselen' : 'Bekreft ny e-postadresse',
    actionUrl,
    baseUrl,
  });
}

export function renderEmailChangeNoticeEmail({ baseUrl, completed }) {
  const subject = completed ? 'Hoved-e-post er endret' : 'Forsøk på endring av hoved-e-post';
  const heading = completed ? 'Endringen er fullført' : 'En endring er påbegynt';
  const body = completed
    ? 'Hoved-e-post for medlemskapet er endret etter kontroll av både gammel og ny adresse. Alle eksisterende medlems- og undersøkelsesøkter er avsluttet.'
    : 'Det er bedt om å endre hoved-e-post for medlemskapet. Hvis dette ikke var deg, kontakt Turufjell Vel så snart som mulig.';
  const safeSubject = escapeHtml(subject);
  const emailBrand = renderEmailBrand(baseUrl);
  const html = `<!doctype html><html lang="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${safeSubject}</title></head><body style="margin:0;background:#EBEBDE;color:#493F39;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#EBEBDE"><tr><td align="center" style="padding:28px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #D9D5C6;border-radius:14px"><tr><td style="padding:28px 32px 16px">${emailBrand}</td></tr><tr><td style="padding:12px 32px 34px"><p style="margin:0 0 10px;color:#955E6E;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em">Sikkerhetsvarsel</p><h1 style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:28px;font-weight:400;line-height:1.25;color:#493F39">${heading}</h1><p style="margin:0;font-size:16px;line-height:1.65">${body}</p></td></tr></table><p style="margin:18px 0 0;color:#6F645E;font-size:12px">${SYSTEM_EMAIL_FOOTER}</p></td></tr></table></body></html>`;
  return { subject, html, text: `Turufjell Vel\n\n${heading}\n\n${body}\n\n${SYSTEM_EMAIL_FOOTER}` };
}
