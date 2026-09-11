import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { normalizeEmail } from './mailer-service.js';

export const MEMBER_SESSION_COOKIE = 'tfv_member_access';
export const MEMBER_ACCESS_TTL_SECONDS = 24 * 60 * 60;

export function randomId() {
  return randomUUID().replaceAll('-', '');
}

export function createAccessSecret() {
  return randomBytes(32).toString('hex');
}

export function hashAccessSecret(secret) {
  return createHash('sha256').update(String(secret || ''), 'utf8').digest('hex');
}

export function isAccessSecret(value) {
  return /^[a-f0-9]{64}$/i.test(value || '');
}

export function cleanText(value, maxLength = 500, required = false) {
  if (typeof value !== 'string' || value.length > maxLength) throw new Error('Invalid member data');
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (required && !cleaned) throw new Error('Invalid member data');
  return cleaned || null;
}

export function normalizeContactDetails(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid member data');
  const primaryContactName = cleanText(input.primary_contact_name || '', 500, true);
  const primaryContactEmail = normalizeEmail(input.primary_contact_email);
  if (!primaryContactEmail) throw new Error('Invalid member data');
  const rawOthers = Array.isArray(input.other_contact_emails)
    ? input.other_contact_emails
    : String(input.other_contact_emails || '').split(/[\n,;]+/);
  if (rawOthers.length > 10) throw new Error('Invalid member data');
  const otherContactEmails = rawOthers.map((email) => normalizeEmail(email)).filter(Boolean);
  if (otherContactEmails.length !== rawOthers.map((email) => String(email).trim()).filter(Boolean).length) {
    throw new Error('Invalid member data');
  }
  return {
    primary_contact_name: primaryContactName,
    primary_contact_email: primaryContactEmail,
    other_contact_emails: [...new Set(otherContactEmails.filter((email) => email !== primaryContactEmail))],
  };
}

export function normalizeMemberLookup(value) {
  const lookup = cleanText(String(value || ''), 320, true);
  return lookup.toLowerCase();
}

export function normalizeMembershipRequest(input) {
  const contacts = normalizeContactDetails(input);
  const hNumber = cleanText(input.h_number || '', 100);
  const streetAddress = cleanText(input.street_address || '', 500);
  if (!hNumber && !streetAddress) throw new Error('Property identifier required');
  return { h_number: hNumber, street_address: streetAddress, ...contacts };
}

export function memberCookieOptions(expiresAt, env = process.env) {
  const expires = new Date(expiresAt);
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires,
    maxAge: Math.max(0, Math.floor((expires.getTime() - Date.now()) / 1000)),
    priority: 'high',
  };
}
