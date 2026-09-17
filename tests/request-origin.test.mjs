import test from 'node:test';
import assert from 'node:assert/strict';
import { getApplicationOrigin, isSameOriginRequest } from '../lib/request-origin.js';

function makeRequest(origin, headers = {}) {
  return new Request(`${origin}/api/admin/matrikkel/runs`, { method: 'POST', headers });
}

test('configured application origin accepts the public domain behind a proxy', () => {
  const request = makeRequest('https://internal-deploy.example', {
    origin: 'https://medlemsservice.turufjellvel.no',
    'sec-fetch-site': 'same-origin',
  });
  const env = { AUTH_URL: 'https://medlemsservice.turufjellvel.no' };
  assert.equal(getApplicationOrigin(request, env), 'https://medlemsservice.turufjellvel.no');
  assert.equal(isSameOriginRequest(request, env), true);
});

test('origin validation rejects cross-site, malformed and misconfigured requests', () => {
  const env = { AUTH_URL: 'https://medlemsservice.turufjellvel.no' };
  assert.equal(isSameOriginRequest(makeRequest('https://internal.example', { origin: 'https://evil.example' }), env), false);
  assert.equal(isSameOriginRequest(makeRequest('https://internal.example', {
    origin: 'https://medlemsservice.turufjellvel.no',
    'sec-fetch-site': 'cross-site',
  }), env), false);
  assert.equal(isSameOriginRequest(makeRequest('https://internal.example', { origin: 'not a URL' }), env), false);
  assert.equal(isSameOriginRequest(makeRequest('https://internal.example', { origin: 'https://medlemsservice.turufjellvel.no' }), { AUTH_URL: 'invalid' }), false);
});

test('server requests without Origin remain available for authenticated internal calls', () => {
  const request = makeRequest('https://example.test');
  assert.equal(isSameOriginRequest(request, {}), true);
  assert.equal(getApplicationOrigin(request, {}), 'https://example.test');
});
