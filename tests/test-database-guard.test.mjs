import test from 'node:test';
import assert from 'node:assert/strict';
import { testDatabaseUrl } from './helpers/postgres.mjs';

test('integration connection guard keeps production and arbitrary remote URLs out', () => {
  const env = { TEST_NEON_HOST: 'ep-test-only.eu-central-1.aws.neon.tech', TEST_NEON_BRANCH_ID: 'br-test-only', TEST_NEON_RUN_ID: 'a'.repeat(64) };
  assert.equal(testDatabaseUrl('postgres://test@localhost/tfv_test', {}), 'postgres://test@localhost/tfv_test');
  const remote = 'postgres://test@ep-test-only.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full';
  assert.equal(testDatabaseUrl(remote, env), remote);
  for (const url of [remote.replace('ep-test-only', 'ep-production'), remote.replace('verify-full', 'require'),
    remote.replace('/neondb', '/production'), `${remote}&options=anything`, remote.replace('ep-test-only.', 'ep-test-only-pooler.'),
    'postgres://test@localhost/neondb', 'postgres://test@evil.invalid/tfv_test', 'http://localhost/tfv_test']) {
    assert.throws(() => testDatabaseUrl(url, env));
  }
  assert.throws(() => testDatabaseUrl(remote, {}));
  assert.throws(() => testDatabaseUrl(remote, { ...env, TEST_NEON_RUN_ID: '' }));
});
