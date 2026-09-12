import test from 'node:test';
import assert from 'node:assert/strict';
import { getSecurityContext } from '../lib/security-config.js';
import { trustedClientAddress } from '../lib/shared-rate-limit.js';
import { updateMemberSelfServiceProfile, verifyMemberAccess } from '../lib/member-self-service.js';

const env = {
  APP_ENVIRONMENT: 'development', TOKEN_AUDIENCE: 'tfv-test',
  SECURITY_EVENT_HMAC_KEY: 'a-development-test-key-with-32-bytes',
};

test('security configuration fails closed outside development', () => {
  assert.deepEqual(getSecurityContext(env), {
    environment: 'development', audience: 'tfv-test', hmacKey: env.SECURITY_EVENT_HMAC_KEY,
  });
  assert.throws(() => getSecurityContext({ NODE_ENV: 'production' }), /not configured/);
  assert.throws(() => getSecurityContext({ APP_ENVIRONMENT: 'production', TOKEN_AUDIENCE: 'tfv-prod', SECURITY_EVENT_HMAC_KEY: 'short' }), /HMAC/);
});

test('production client identity ignores user-controlled forwarding headers', () => {
  const request = new Request('https://example.test', { headers: {
    'x-forwarded-for': '198.51.100.1', 'x-real-ip': '198.51.100.2',
    'x-nf-client-connection-ip': '203.0.113.9',
  } });
  assert.equal(trustedClientAddress(request, { NODE_ENV: 'production' }), '203.0.113.9');
  const spoofed = new Request('https://example.test', { headers: { 'x-forwarded-for': '198.51.100.1' } });
  assert.equal(trustedClientAddress(spoofed, { NODE_ENV: 'production' }), 'unknown');
});

test('member magic link is consumed once and exchanged for a different session secret', async () => {
  let attempts = 0;
  const queries = [];
  const sql = async (strings) => {
    const query = strings.join('?');
    queries.push(query);
    if (query.includes('application_environment')) return [{ environment: 'development' }];
    if (query.includes('INSERT INTO security_events')) return [];
    if (query.includes('WITH consumed AS')) {
      attempts += 1;
      return attempts === 1 ? [{ member_id: '7', expires_at: '2099-01-01' }] : [];
    }
    return [];
  };
  const magicLinkSecret = 'a'.repeat(64);
  const first = await verifyMemberAccess(magicLinkSecret, { sql, env });
  const replay = await verifyMemberAccess(magicLinkSecret, { sql, env });
  assert.match(first.secret, /^[a-f0-9]{64}$/);
  assert.notEqual(first.secret, magicLinkSecret);
  assert.equal(replay, null);
  assert.match(queries.join('\n'), /consumed_at IS NULL/);
  assert.match(queries.join('\n'), /INSERT INTO member_sessions/);
});

test('profile update cannot replace primary email directly', async () => {
  const sql = async (strings) => {
    const query = strings.join('?');
    if (query.includes('application_environment')) return [{ environment: 'development' }];
    if (query.includes('WITH valid_session')) return [{
      id: '7', primary_contact_name: 'Kari', primary_contact_email: 'old@example.no', other_contact_emails: [],
    }];
    throw new Error('Unexpected write');
  };
  await assert.rejects(updateMemberSelfServiceProfile('b'.repeat(64), {
    primary_contact_name: 'Kari', primary_contact_email: 'attacker@example.no', other_contact_emails: [],
  }, { sql, env }), /verification/);
});
