import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAccessSecret, GENERIC_MEMBER_ACCESS_MESSAGE, hashAccessSecret, isAccessSecret,
  MEMBER_ACCESS_TTL_SECONDS, normalizeContactDetails,
  normalizeCadastralNumber, normalizeHNumberLookup, normalizeMemberLookup,
  normalizeMembershipRequest, normalizeSectionNumber,
} from '../lib/member-self-service-utils.js';

test('member access secrets are random and only stored as deterministic hashes', () => {
  const first = createAccessSecret();
  const second = createAccessSecret();
  assert.equal(isAccessSecret(first), true);
  assert.notEqual(first, second);
  assert.match(hashAccessSecret(first), /^[a-f0-9]{64}$/);
  assert.notEqual(hashAccessSecret(first), first);
  assert.equal(MEMBER_ACCESS_TTL_SECONDS, 900);
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

test('public member lookup message reveals no lookup result or member data', () => {
  assert.match(GENERIC_MEMBER_ACCESS_MESSAGE, /Dersom opplysningene samsvarer/);
  assert.doesNotMatch(GENERIC_MEMBER_ACCESS_MESSAGE, /funnet|H-|@/i);
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
  assert.deepEqual(normalizeMembershipRequest({ ...contacts, street_address: 'Nedre Høgsetervegen 10', cadastral_number: ' 10 / 770 ', section_number: '03' }), {
    h_number: null,
    cadastral_number: '10/770',
    section_number: '3',
    street_address: 'Nedre Høgsetervegen 10',
    primary_contact_name: 'Kari Nordmann',
    primary_contact_email: 'kari@example.com',
    other_contact_emails: [],
  });
  assert.equal(normalizeCadastralNumber('10 / 770'), '10/770');
  assert.equal(normalizeSectionNumber('004'), '4');
  assert.throws(() => normalizeCadastralNumber('10-770'), /Invalid cadastral number/);
  assert.throws(() => normalizeMembershipRequest({ ...contacts, h_number: 'H25', section_number: '2' }), /Cadastral number required/);
  assert.throws(() => normalizeMembershipRequest(contacts), /Property identifier required/);
});
