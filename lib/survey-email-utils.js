import { normalizeEmail } from './mailer-service.js';

const SURVEY_ID_PATTERN = /^[a-f0-9]{32}$/i;
const TOKEN_PATTERN = /^[a-f0-9]{32}$/i;

export function buildSurveyUrl({ baseUrl, accessToken, surveyId }) {
  if (!TOKEN_PATTERN.test(accessToken || '') || !SURVEY_ID_PATTERN.test(surveyId || '')) throw new Error('Invalid survey link');
  const url = new URL('/survey', baseUrl);
  url.searchParams.set('klm', accessToken.toLowerCase());
  url.searchParams.set('xyz', surveyId.toLowerCase());
  return url.toString();
}

export function selectCampaignRecipients(members) {
  return members.map((member) => ({ ...member, email: normalizeEmail(member.primary_contact_email) }))
    .filter((member) => member.email);
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
