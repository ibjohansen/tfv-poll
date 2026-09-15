import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '../helpers/postgres.mjs';

const db = createTestDatabase();
before(async () => { await db.migrate(); });
after(async () => { await db.close(); });

test('schema can be applied twice without losing existing rows', async () => {
  const hNumber = `test-${randomUUID()}`;
  const [member] = await db.sql`INSERT INTO members (h_number, last_changed_by)
    VALUES (${hNumber}, 'admin@example.test') RETURNING id`;
  await db.migrate();
  const [preserved] = await db.sql`SELECT h_number FROM members WHERE id = ${member.id}`;
  assert.equal(preserved.h_number, hNumber);
});

test('real member audit trigger preserves actor, omits secret and ignores a no-op', async () => {
  const hNumber = `test-${randomUUID()}`;
  const [member] = await db.sql`INSERT INTO members (h_number, last_changed_by)
    VALUES (${hNumber}, 'admin@example.test') RETURNING id`;
  await db.sql`UPDATE members SET street_address = 'Testvegen 7', last_changed_by = 'editor@example.test'
    WHERE id = ${member.id}`;
  await db.sql`UPDATE members SET street_address = 'Testvegen 7', last_changed_by = 'noop@example.test'
    WHERE id = ${member.id}`;
  const audit = await db.sql`SELECT * FROM audit_log WHERE table_name = 'members'
    AND row_id = ${String(member.id)} ORDER BY id`;
  assert.equal(audit.length, 2);
  assert.equal(audit[1].changed_by, 'editor@example.test');
  assert.equal(audit[1].after_value.street_address, 'Testvegen 7');
  assert.equal(Object.hasOwn(audit[1].after_value, 'access_token'), false);
  assert.equal(Object.hasOwn(audit[1].after_value, 'last_changed_by'), false);
});

test('transaction rolls back the member and its audit event together', async () => {
  const hNumber = `test-${randomUUID()}`;
  await assert.rejects(db.sql.transaction([
    db.sql`INSERT INTO members (h_number) VALUES (${hNumber})`,
    db.sql`SELECT 1 / 0`,
  ]), { code: '22012' });
  assert.equal((await db.sql`SELECT id FROM members WHERE h_number = ${hNumber}`).length, 0);
  assert.equal((await db.sql`SELECT id FROM audit_log WHERE after_value->>'h_number' = ${hNumber}`).length, 0);
});

test('audit and security logs reject direct changes, deletion and truncation', async () => {
  const [{ id }] = await db.sql`INSERT INTO audit_log (table_name, row_id, operation, changed_by)
    VALUES ('admin_actions', 'synthetic-test', 'INSERT', 'admin@example.test') RETURNING id`;
  await assert.rejects(async () => await db.sql`UPDATE audit_log SET changed_by = 'forged@example.test' WHERE id = ${id}`, /append-only/);
  await assert.rejects(async () => await db.sql`DELETE FROM audit_log WHERE id = ${id}`, /append-only/);
  await assert.rejects(async () => await db.sql`TRUNCATE audit_log`, /append-only/);
  await assert.rejects(async () => await db.sql`TRUNCATE security_events`, /append-only/);
  assert.equal((await db.sql`SELECT changed_by FROM audit_log WHERE id = ${id}`)[0].changed_by, 'admin@example.test');
});
