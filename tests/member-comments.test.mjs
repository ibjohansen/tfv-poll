import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMemberComment, MEMBER_COMMENT_MAX_LENGTH } from '../lib/member-comments.js';

test('optional comments have bounded length, preserve plain text/newlines and reject controls', () => {
  for (const value of [null, undefined, '', '   ']) assert.equal(normalizeMemberComment(value), null);
  assert.equal(normalizeMemberComment('  Første\r\nAndre  '), 'Første\nAndre');
  assert.equal(normalizeMemberComment('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>', 'stored as text, never HTML');
  assert.equal(normalizeMemberComment('x'.repeat(MEMBER_COMMENT_MAX_LENGTH)).length, MEMBER_COMMENT_MAX_LENGTH);
  for (const value of [{}, 3, 'x'.repeat(MEMBER_COMMENT_MAX_LENGTH + 1), '\u0000']) assert.throws(() => normalizeMemberComment(value), /Invalid member data/);
});
