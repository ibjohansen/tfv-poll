import test from 'node:test';
import assert from 'node:assert/strict';
import { apiErrorStatus } from '../lib/api-errors.js';

test('error mapping distinguishes validation, permissions, conflicts and server failures', () => {
  for (const [message, status] of [['Unauthorized', 401], ['Forbidden', 403], ['Invalid member', 400], ['Member not found', 404], ['Run still active', 409], ['CMS storage is not configured', 503], ['Unexpected internal error', 500]]) assert.equal(apiErrorStatus(new Error(message)), status);
  assert.equal(apiErrorStatus(new Error('Unauthorized'), 403), 403);
  assert.equal(apiErrorStatus(new SyntaxError('Malformed JSON')), 400);
  assert.equal(apiErrorStatus(Object.assign(new Error('constraint'), { cause: { code: '23505' } })), 409);
  assert.equal(apiErrorStatus(Object.assign(new Error('deadline'), { name: 'TimeoutError' })), 504);
  assert.equal(apiErrorStatus(Object.assign(new Error('cancelled'), { name: 'AbortError' })), 504);
  assert.equal(apiErrorStatus(Object.assign(new Error('database'), { code: '08006' })), 500);
  assert.equal(apiErrorStatus(Object.assign(new Error('bad status'), { status: 200 })), 500);
});
