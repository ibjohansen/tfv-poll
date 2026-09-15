import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, request, plain } from './helpers/load-module.mjs';

test('group input is bounded and never accepts arbitrary kinds, IDs or operations', async () => {
  const api = await loadModule('lib/member-groups.js', { './db.js': { getSql: () => { throw Error('Unexpected DB'); } },
    './admin-access.js': { requirePermission: async () => { throw Error('Forbidden'); } }, './mock-store.js': { isMockMode: () => false } });
  const good = { kind: 'email', action: 'add', id: '1', memberIds: ['2', '2', 3] };
  assert.deepEqual(plain(api.normalizeGroupInput(good)).memberIds, ['2', '3']);
  for (const input of [null, [], { ...good, kind: 'members; DROP' }, { ...good, action: 'truncate' }, { ...good, id: '-1' }, { ...good, memberIds: ['1;DELETE'] }, { ...good, memberIds: [] }, { kind: 'hamlet', action: 'create', name: ' ' }, { kind: 'hamlet', action: 'create', name: 'x'.repeat(101) }]) {
    assert.throws(() => api.normalizeGroupInput(input));
  }
  await assert.rejects(api.changeMemberGroup(good), /Forbidden/);
});

test('group routes protect origins, propagate authorization and conceal database details', async () => {
  let error = null, calls = 0;
  const route = await loadModule('app/api/admin/member-groups/route.js', { '@/lib/member-groups': {
    getMemberGroups: async () => { if (error) throw error; return []; },
    changeMemberGroup: async () => { calls++; if (error) throw error; return { id: '1' }; },
  } });
  assert.equal((await route.GET()).status, 200);
  assert.equal((await route.POST(request('/api/admin/member-groups', { method: 'POST', body: {}, headers: { origin: 'https://evil.example' } }))).status, 403);
  assert.equal(calls, 0);
  for (const [message, status] of [['Unauthorized', 401], ['Forbidden', 403], ['Invalid member selection', 400], ['password-private-db', 500]]) {
    error = new Error(message);
    const response = await route.POST(request('/api/admin/member-groups', { method: 'POST', body: {} }));
    assert.equal(response.status, status); assert.doesNotMatch(await response.text(), /password-private-db/);
  }
});
