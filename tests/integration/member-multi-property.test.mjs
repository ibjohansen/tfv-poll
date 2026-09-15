import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '../helpers/postgres.mjs';
import { loadMemberService } from '../helpers/member-service.mjs';

const db = createTestDatabase();
let api;
const deliveries = [];
before(async () => {
  await db.migrate();
  api = await loadMemberService(db.sql, async (email) => { deliveries.push(email); return { messageId: randomUUID() }; });
});
after(async () => db.close());

async function member(email, extra = []) {
  const [row] = await db.sql`INSERT INTO members (h_number, primary_contact_name, primary_contact_email, other_contact_emails)
    VALUES (${`multi-${randomUUID()}`}, 'Syntetisk kontakt', ${email}, ${extra}) RETURNING id, h_number`;
  return row;
}
function secretFor(email) {
  return new URL(deliveries.find((delivery) => delivery.to === email).text).searchParams.get('token');
}

test('shared main email receives one link for all its plots, even with concurrent different identifiers', async () => {
  const email = `${randomUUID()}@example.test`;
  const first = await member(email);
  const second = await member(` ${email.toUpperCase()} `);
  const outsider = await member(`${randomUUID()}@example.test`, [email]);
  // The direct email lookup is ambiguous because it is someone else's extra
  // contact. Plot lookups still resolve the same main-contact scope safely.
  await Promise.all([api.requestMemberAccess(first.h_number), api.requestMemberAccess(second.h_number), api.requestMemberAccess(first.h_number)]);
  assert.equal(deliveries.filter((delivery) => delivery.to === email).length, 1);
  const tokens = await db.sql`SELECT * FROM member_access_tokens WHERE contact_email = ${email}`;
  assert.equal(tokens.length, 1);
  assert.deepEqual(tokens[0].member_ids.map(String), [first.id, second.id].map(String));
  const sessions = await Promise.all([api.verifyMemberAccess(secretFor(email)), api.verifyMemberAccess(secretFor(email))]);
  assert.equal(sessions.filter(Boolean).length, 1);
  const secret = sessions.find(Boolean).secret;
  const profile = await api.getMemberSelfServiceProfile(secret, second.id);
  assert.equal(profile.member.id, second.id);
  assert.equal(profile.properties.length, 2);
  assert.equal(await api.getMemberSelfServiceProfile(secret, outsider.id), null);
  assert.equal(await api.getMemberSelfServiceProfile(secret, ''), null);
  await assert.rejects(api.updateMemberSelfServiceProfile(secret, {
    memberId: outsider.id, primary_contact_name: 'Not allowed', primary_contact_email: email, other_contact_emails: [],
  }), /Invalid member session/);
  await api.updateMemberSelfServiceProfile(secret, {
    memberId: second.id, primary_contact_name: 'Kun andre tomt', primary_contact_email: email, other_contact_emails: [],
  });
  assert.equal((await db.sql`SELECT primary_contact_name FROM members WHERE id = ${first.id}`)[0].primary_contact_name, 'Syntetisk kontakt');
  assert.equal((await db.sql`SELECT primary_contact_name FROM members WHERE id = ${second.id}`)[0].primary_contact_name, 'Kun andre tomt');
  const addedLater = await member(email);
  assert.equal(await api.getMemberSelfServiceProfile(secret, addedLater.id), null);
  await db.sql`UPDATE members SET primary_contact_email = 'new-holder@example.test' WHERE id = ${second.id}`;
  assert.equal(await api.getMemberSelfServiceProfile(secret, second.id), null);
  await db.sql`UPDATE members SET deleted_at = NOW() WHERE id = ${first.id}`;
  assert.equal(await api.getMemberSelfServiceProfile(secret), null);
});

test('an email shared only by the same main contact is accepted; a single plot needs no selection', async () => {
  const email = `${randomUUID()}@example.test`;
  await member(email);
  await member(email);
  await api.requestMemberAccess(email);
  const session = await api.verifyMemberAccess(secretFor(email));
  assert.equal((await api.getMemberSelfServiceProfile(session.secret)).properties.length, 2);
  const singleEmail = `${randomUUID()}@example.test`;
  const only = await member(singleEmail);
  await api.requestMemberAccess(singleEmail);
  const singleSession = await api.verifyMemberAccess(secretFor(singleEmail));
  const profile = await api.getMemberSelfServiceProfile(singleSession.secret);
  assert.equal(profile.member.id, only.id);
  assert.equal(profile.properties.length, 1);
});

test('a link whose entire scope has changed email is consumed without creating a session', async () => {
  const email = `${randomUUID()}@example.test`;
  const plot = await member(email);
  await api.requestMemberAccess(email);
  await db.sql`UPDATE members SET primary_contact_email = 'changed@example.test' WHERE id = ${plot.id}`;
  assert.equal(await api.verifyMemberAccess(secretFor(email)), null);
  assert.equal((await db.sql`SELECT id FROM member_sessions WHERE member_id = ${plot.id}`).length, 0);
});
