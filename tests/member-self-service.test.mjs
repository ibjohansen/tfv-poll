import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAccessSecret, formatMemberLookupMessage, hashAccessSecret, isAccessSecret,
  maskEmailAddress, MEMBER_ACCESS_TTL_SECONDS, normalizeContactDetails,
  normalizeHNumberLookup, normalizeMemberLookup, normalizeMembershipRequest,
} from '../lib/member-self-service-utils.js';

test('member access secrets are random and only stored as deterministic hashes', () => {
  const first = createAccessSecret();
  const second = createAccessSecret();
  assert.equal(isAccessSecret(first), true);
  assert.notEqual(first, second);
  assert.match(hashAccessSecret(first), /^[a-f0-9]{64}$/);
  assert.notEqual(hashAccessSecret(first), first);
  assert.equal(MEMBER_ACCESS_TTL_SECONDS, 86_400);
});

test('member lookup is normalized without accepting empty or oversized values', () => {
  assert.equal(normalizeMemberLookup('  Fjellvegen 12  '), 'fjellvegen 12');
  for (const value of ['H25', 'H-25', 'h25', 'h-25', 'H  25', '25']) {
    assert.equal(normalizeHNumberLookup(value), '25', value);
  }
  assert.equal(normalizeHNumberLookup('Fjellvegen 25'), null);
  assert.throws(() => normalizeMemberLookup(''), /Invalid member data/);
  assert.throws(() => normalizeMemberLookup('x'.repeat(321)), /Invalid member data/);
});

test('member lookup messages distinguish missing and found records without exposing the email address', () => {
  assert.equal(formatMemberLookupMessage({ found: false, lookup: 'Ukjent 17' }), 'Ukjent 17 - ble ikke funnet i databasen.');
  const maskedEmail = maskEmailAddress('ib.johansen@gmail.com');
  assert.equal(maskedEmail, 'ib.***********@*****.com');
  const message = formatMemberLookupMessage({
    found: true,
    lookup: '25',
    hNumber: '25',
    streetAddress: 'Fjellvegen 1',
    maskedEmail,
  });
  assert.equal(message, 'Tomt H-25, Fjellvegen 1, ib.***********@*****.com er funnet.');
  assert.equal(formatMemberLookupMessage({
    found: true,
    hNumber: '25',
    streetAddress: 'Fjellvegen 1',
    maskedEmail,
    emailRequested: true,
  }), 'Tomt H-25, Fjellvegen 1, ib.***********@*****.com er funnet, sjekk mailen din.');
  assert.equal(message.includes('ib.johansen@gmail.com'), false);
});

test('only valid normalized contact fields are accepted', () => {
  assert.deepEqual(normalizeContactDetails({
    primary_contact_name: ' Kari  Nordmann ',
    primary_contact_email: 'KARI@EXAMPLE.COM',
    other_contact_emails: ['andre@example.com', 'kari@example.com', 'andre@example.com'],
  }), {
    primary_contact_name: 'Kari Nordmann',
    primary_contact_email: 'kari@example.com',
    other_contact_emails: ['andre@example.com'],
  });
  assert.throws(() => normalizeContactDetails({ primary_contact_name: '', primary_contact_email: 'invalid' }), /Invalid member data/);
});

test('a membership request requires an address or H-number', () => {
  const contacts = { primary_contact_name: 'Kari Nordmann', primary_contact_email: 'kari@example.com' };
  assert.equal(normalizeMembershipRequest({ ...contacts, h_number: 'H25' }).h_number, 'H25');
  assert.throws(() => normalizeMembershipRequest(contacts), /Property identifier required/);
});
