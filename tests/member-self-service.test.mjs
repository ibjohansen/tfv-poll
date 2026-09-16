import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAccessSecret, GENERIC_MEMBER_ACCESS_MESSAGE, hashAccessSecret, isAccessSecret,
  MEMBER_ACCESS_TTL_SECONDS, normalizeContactDetails,
  normalizeAddressLookup, normalizeCadastralNumber, normalizeHNumberLookup, normalizeMemberLookup,
  normalizeMembershipRequest, normalizeSectionNumber,
} from '../lib/member-self-service-utils.js';
import { createMembershipRequest } from '../lib/member-self-service.js';
import { loadMemberService } from './helpers/member-service.mjs';

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

test('property lookup normalizes address case, spacing and H-number punctuation', () => {
  assert.equal(normalizeAddressLookup('  Øvre   Sprenåsen 37  '), 'øvre sprenåsen 37');
  assert.equal(normalizeAddressLookup(''), null);
  for (const value of ['H242', 'H-242', 'H 242', '242']) assert.equal(normalizeHNumberLookup(value), '242');
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

test('an existing property stops before provider calls even when address and cadastral number are both supplied', async () => {
  const queries = [];
  const sql = async (strings, ...values) => {
    const query = strings.join(' ');
    queries.push({ query, values });
    if (query.includes('SELECT environment FROM application_environment')) return [{ environment: 'development' }];
    if (query.includes('DELETE FROM member_requests')) return [];
    if (query.includes('SELECT id FROM members')) {
      assert.doesNotMatch(query, /cadastral_number[^)]*IS NULL[^)]*street_address/s);
      assert.ok(values.includes('242'));
      assert.ok(values.includes('øvre sprenåsen 37'));
      return [{ id: '1' }];
    }
    throw new Error(`Unexpected query after duplicate match: ${query}`);
  };
  const stages = [];
  const result = await createMembershipRequest({
    h_number: 'H-242', street_address: ' Øvre  Sprenåsen 37 ', cadastral_number: '10/525',
    primary_contact_name: 'Testperson', primary_contact_email: 'test@example.test',
  }, {
    sql, onStage: (stage) => stages.push(stage),
    env: { APP_ENVIRONMENT: 'development', TOKEN_AUDIENCE: 'tfv-development', SECURITY_EVENT_HMAC_KEY: 'development-only-security-event-key' },
  });
  assert.deepEqual(result, { accepted: true, outcome: 'existing_property' });
  assert.deepEqual(stages, ['database_environment', 'expired_request_cleanup', 'existing_property_check']);
  assert.equal(queries.length, 3);
});

test('approved public membership requests persist the same safe hamlet assignment as admin-created plots', async () => {
  const queries = [];
  const requestId = 'a'.repeat(32);
  const sql = async (strings, ...values) => {
    const query = strings.join(' ');
    queries.push({ query, values });
    if (query.includes('SELECT * FROM member_requests')) return [{
      id: requestId, request_type: 'membership', status: 'pending', h_number: 'H999',
      cadastral_number: '10/999', section_number: null, street_address: 'Testvegen 9',
      requested_contact_name: 'Syntetisk medlem', requested_primary_email: 'synthetic@example.test',
      requested_other_emails: [], matrikkel_review: { status: 'manual' },
    }];
    if (query.includes('WITH inserted_member AS')) return [{ id: requestId, status: 'approved', member_id: '99' }];
    throw new Error(`Unexpected query: ${query}`);
  };
  const api = await loadMemberService(sql, null, { hamlet: { id: '7', name: 'Testgrend' }, status: 'linked' });
  const approved = await api.resolveAdminMemberRequest(requestId, 'approve');
  assert.equal(approved.member_id, '99');
  const insert = queries.find(({ query }) => query.includes('WITH inserted_member AS'));
  assert.match(insert.query, /other_contact_emails, hamlet_id, last_changed_by/);
  assert.ok(insert.values.includes('7'));
});
