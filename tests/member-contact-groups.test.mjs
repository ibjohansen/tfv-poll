import test from 'node:test';
import assert from 'node:assert/strict';
import { attachSharedContactGroups, memberContactEmails } from '../lib/member-contact-groups.js';

test('shared primary/additional email groups link properties without merging records', () => {
  const members = [
    { id: 1, h_number: 'H1', primary_contact_name: 'Test En', primary_contact_email: ' Shared@Example.test ', other_contact_emails: ['shared@example.test'] },
    { id: 2, h_number: 'H2', primary_contact_name: 'Test To', primary_contact_email: 'different@example.test', other_contact_emails: ['SHARED@example.test'] },
    { id: 3, h_number: 'H3', primary_contact_email: 'unique@example.test' },
  ];
  const result = attachSharedContactGroups(members.slice(0, 1), members);
  assert.equal(result.length, 1, 'pagination preserved');
  assert.equal(result[0].id, 1);
  assert.equal(result[0].shared_email_groups[0].email, 'shared@example.test');
  assert.deepEqual(result[0].shared_email_groups[0].properties.map((member) => member.id), ['1', '2']);
  assert.equal(members[0].shared_email_groups, undefined);
  assert.deepEqual(memberContactEmails({ primary_contact_email: 'invalid', other_contact_emails: ['', null] }), []);
});
