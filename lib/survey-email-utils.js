import { normalizeEmail } from './mailer-service.js';

const SURVEY_ID_PATTERN = /^[a-f0-9]{32}$/i;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

export function buildSurveyUrl({ baseUrl, accessToken, surveyId }) {
  if (!TOKEN_PATTERN.test(accessToken || '') || !SURVEY_ID_PATTERN.test(surveyId || '')) throw new Error('Invalid survey link');
  const url = new URL('/api/survey-access/verify', baseUrl);
  url.searchParams.set('token', accessToken.toLowerCase());
  return url.toString();
}

export function selectCampaignRecipients(members, includeOtherEmails = false) {
  const seen = new Set();
  return members.flatMap((member) => {
    const primary = normalizeEmail(member.primary_contact_email);
    const emails = [...new Set([primary, ...(includeOtherEmails && Array.isArray(member.other_contact_emails) ? member.other_contact_emails.map(normalizeEmail) : [])].filter(Boolean))];
    return emails.filter((email) => { const key = `${member.id}:${email}`; if (seen.has(key)) return false; seen.add(key); return true; })
      .map((email) => ({ ...member, email, primaryEmail: primary, propertyRecipients: emails }));
  });
}

export function normalizeSurveyMemberIds(value = []) {
  if (!Array.isArray(value) || value.length > 500 || value.some((id) => !/^[1-9][0-9]{0,15}$/.test(String(id)))) throw new Error('Invalid member selection');
  return [...new Set(value.map(String))];
}

export function parseTestRecipients(value) {
  const entries = (Array.isArray(value) ? value : String(value || '').split(','))
    .map((entry) => String(entry).trim());
  if (!entries.length || entries.some((entry) => !entry) || entries.length > 2) {
    throw new Error('Invalid test recipient');
  }
  const recipients = entries.map(normalizeEmail);
  if (recipients.some((email) => !email)) throw new Error('Invalid test recipient');
  return [...new Set(recipients)];
}

export function isPastSurveyEnd(endsOn, now = new Date()) {
  const osloDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const endDate = endsOn instanceof Date ? endsOn.toISOString().slice(0, 10) : String(endsOn).slice(0, 10);
  return endDate < osloDate;
}
