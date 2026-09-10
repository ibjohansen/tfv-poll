import test from 'node:test';
import assert from 'node:assert/strict';
import { clearRateLimits, isEmailRateLimited, isRateLimited } from '../lib/rate-limit.js';

test('the public response endpoint has a per-client request limit', () => {
  clearRateLimits();
  const request = new Request('https://example.test/survey/api/responses', { headers: { 'x-forwarded-for': '203.0.113.8' } });
  for (let count = 0; count < 20; count += 1) assert.equal(isRateLimited(request), false);
  assert.equal(isRateLimited(request), true);
  clearRateLimits();
});

test('email mutations have a stricter per-client backstop', () => {
  clearRateLimits();
  const request = new Request('https://example.test/api/admin/surveys/id/email', { headers: { 'x-forwarded-for': '203.0.113.9' } });
  for (let count = 0; count < 5; count += 1) assert.equal(isEmailRateLimited(request), false);
  assert.equal(isEmailRateLimited(request), true);
  clearRateLimits();
});
