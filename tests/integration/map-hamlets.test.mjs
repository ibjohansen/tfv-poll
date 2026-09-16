import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '../helpers/postgres.mjs';
import { loadModule } from '../helpers/load-module.mjs';
import { MapError } from '../../lib/map/geo.js';
import * as hamlets from '../../lib/map/hamlets.js';
import { square } from '../fixtures/map.mjs';

const db = createTestDatabase();
let maps, groups;
let syncRows = [];
before(async () => {
  await db.migrate(); await db.migrate();
  maps = await loadModule('lib/map/hamlet-service.js', {
    '../admin-access.js': { requirePermission: async () => ({ email: 'map-admin@example.test' }) },
    '../db.js': { getSql: () => db.sql }, '../mock-store.js': { isMockMode: () => false },
    './geo.js': { MapError }, './hamlets.js': hamlets,
    './service.js': { searchMapData: async () => ({ comparison: { rows: syncRows } }) },
  });
  groups = await loadModule('lib/member-groups.js', {
    './admin-access.js': { requirePermission: async () => ({ email: 'group-admin@example.test' }) },
    './db.js': { getSql: () => db.sql }, './mock-store.js': { isMockMode: () => false },
  });
});
after(async () => db.close());
const create = () => maps.saveMapHamlet({ action: 'create', name: `Karttest ${randomUUID()}`, polygon: square });

test('polygon survives reload and repeated migration; name and draft status are persisted', async () => {
  const created = await create();
  assert.equal(created.version, 1); assert.equal(created.reviewed, false);
  await db.migrate();
  const fetched = (await maps.getMapHamlets()).find((h) => h.id === created.id);
  assert.deepEqual(fetched, created);
  const saved = await maps.saveMapHamlet({ action: 'save', id: created.id, version: created.version,
    name: `${created.name} endret`, polygon: created.polygon, reviewed: true });
  assert.equal(saved.version, 2); assert.equal(saved.reviewed, true);
  assert.equal((await groups.getMemberGroups()).find((g) => String(g.id) === created.id && g.kind === 'hamlet').name, saved.name);
  const events = await db.sql`SELECT after_value, changed_by FROM audit_log WHERE table_name='admin_actions'
    AND row_id=${created.id} AND after_value->>'action' LIKE 'hamlet_polygon_%' ORDER BY id`;
  assert.equal(events.length, 2); assert.ok(events.every((e) => e.changed_by === 'map-admin@example.test'));
  assert.doesNotMatch(JSON.stringify(events), /coordinates|owners|memberIds/);
});

test('existing hamlet gets geometry; clearing geometry preserves group and member assignment', async () => {
  const created = await groups.changeMemberGroup({ action: 'create', kind: 'hamlet', name: `Eksisterende ${randomUUID()}` });
  const before = (await maps.getMapHamlets()).find((h) => h.id === String(created.id));
  assert.equal(before.polygon, null);
  const [member] = await db.sql`INSERT INTO members(h_number,hamlet_id) VALUES (${`HAMLET-${randomUUID()}`},${created.id}) RETURNING id`;
  const saved = await maps.saveMapHamlet({ action: 'save', id: before.id, version: before.version, name: before.name, polygon: square });
  const cleared = await maps.saveMapHamlet({ action: 'clear', id: saved.id, version: saved.version });
  assert.equal(cleared.polygon, null); assert.equal(cleared.name, saved.name); assert.equal(cleared.reviewed, false);
  assert.equal(cleared.version, saved.version + 1);
  const [check] = await db.sql`SELECT hamlet_id,deleted_at FROM members WHERE id=${member.id}`;
  assert.equal(String(check.hamlet_id), cleared.id); assert.equal(check.deleted_at, null);
});

test('competing saves have one winner and one conflict without lost updates or extra audit', async () => {
  const created = await create();
  const outcomes = await Promise.allSettled([true, false].map((reviewed) => maps.saveMapHamlet({ action: 'save', id: created.id,
    version: created.version, name: created.name, polygon: square, reviewed })));
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find((r) => r.status === 'rejected').reason.status, 409);
  const [{ count }] = await db.sql`SELECT count(*)::int AS count FROM audit_log WHERE table_name='admin_actions' AND row_id=${created.id}
    AND after_value->>'action' LIKE 'hamlet_polygon_%'`;
  assert.equal(count, 2);
});

test('rename/deletion from group administration invalidates an old polygon editor', async () => {
  const created = await create();
  await groups.changeMemberGroup({ action: 'rename', kind: 'hamlet', id: created.id, name: `${created.name} gruppe` });
  await assert.rejects(maps.saveMapHamlet({ action: 'save', id: created.id, version: created.version, name: created.name, polygon: square }), (e) => e.status === 409);
  const current = (await maps.getMapHamlets()).find((h) => h.id === created.id);
  assert.equal(current.version, 2);
  await groups.changeMemberGroup({ action: 'delete', kind: 'hamlet', id: created.id });
  await assert.rejects(maps.saveMapHamlet({ action: 'clear', id: created.id, version: current.version }), (e) => e.status === 409);
  assert.ok(!(await maps.getMapHamlets()).some((h) => h.id === created.id));
  const [softDeleted] = await db.sql`SELECT polygon,deleted_at FROM member_hamlets WHERE id=${created.id}`;
  assert.ok(softDeleted.deleted_at); assert.deepEqual(softDeleted.polygon, square);
});

test('duplicate names and invalid JSON geometry are rejected without partial writes', async () => {
  const created = await create();
  await assert.rejects(maps.saveMapHamlet({ action: 'create', name: created.name.toUpperCase(), polygon: square }), (e) => e.status === 409);
  for (const invalid of [{}, { type: 'Point', coordinates: [9,60] }, { type: 'Polygon' }]) {
    await assert.rejects(async () => await db.sql`UPDATE member_hamlets SET polygon=${JSON.stringify(invalid)}::jsonb WHERE id=${created.id}`, (e) => e.code === '23514');
  }
  const current = (await maps.getMapHamlets()).find((h) => h.id === created.id);
  assert.equal(current.version, 1); assert.deepEqual(current.polygon.geometry, square);
});

test('failed audit insert rolls back geometry, name and version together', async () => {
  const created = await create();
  await db.sql.query(`CREATE FUNCTION reject_hamlet_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.after_value->>'action' = 'hamlet_polygon_save' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await db.sql.query('CREATE TRIGGER hamlet_test_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_hamlet_test_audit()');
  try {
    await assert.rejects(maps.saveMapHamlet({ action: 'save', id: created.id, version: created.version, name: `${created.name} failed`, polygon: square, reviewed: true }));
    assert.deepEqual((await maps.getMapHamlets()).find((h) => h.id === created.id), created);
  } finally {
    await db.sql.query('DROP TRIGGER hamlet_test_audit ON audit_log');
    await db.sql.query('DROP FUNCTION reject_hamlet_test_audit()');
  }
});

test('reviewed polygon links secure matches without moving existing hamlet assignments', async () => {
  const selected = await maps.saveMapHamlet({ action: 'create', name: `Synk ${randomUUID()}`, polygon: square, reviewed: true });
  const other = await maps.saveMapHamlet({ action: 'create', name: `Annen ${randomUUID()}`, polygon: square, reviewed: true });
  const members = await db.sql`INSERT INTO members(h_number,hamlet_id) VALUES
    (${`SYNC-A-${randomUUID()}`},NULL), (${`SYNC-B-${randomUUID()}`},${selected.id}), (${`SYNC-C-${randomUUID()}`},${other.id})
    RETURNING id`;
  syncRows = members.map((member) => ({ status: 'MATCH', scope: 'address_in_polygon', register: { id: String(member.id) } }));
  const result = await maps.syncMapHamletMembers({ action: 'sync_members', id: selected.id, version: selected.version });
  assert.deepEqual(result, { hamletId: selected.id, matchedCount: 3, linkedCount: 1, alreadyLinkedCount: 1, assignedElsewhereCount: 1 });
  const assignments = await db.sql`SELECT id::text,hamlet_id::text FROM members WHERE id = ANY(${members.map((member) => member.id)}::bigint[]) ORDER BY id`;
  assert.equal(assignments[0].hamlet_id, selected.id);
  assert.equal(assignments[1].hamlet_id, selected.id);
  assert.equal(assignments[2].hamlet_id, other.id);
  const [audit] = await db.sql`SELECT after_value FROM audit_log WHERE table_name='admin_actions' AND row_id=${selected.id}
    AND after_value->>'action'='hamlet_members_sync' ORDER BY id DESC LIMIT 1`;
  assert.equal(audit.after_value.linked_count, 1);
  assert.equal(audit.after_value.assigned_elsewhere_count, 1);
});
