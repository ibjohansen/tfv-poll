import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, plain, request } from './helpers/load-module.mjs';
import * as hamlets from '../lib/map/hamlets.js';
import { MapError } from '../lib/map/geo.js';
import { readLimitedJson } from '../lib/map/http.js';
import { square } from './fixtures/map.mjs';

const input = { action: 'create', name: ' Slåtta Øst ', polygon: square };
const row = { id: '1', name: 'Slåtta Øst', polygon: square, polygon_reviewed: false, polygon_version: 1, polygon_updated_at: '2026-09-16T00:00:00Z' };

test('hamlet input validates names, IDs, versions, review flags and exact polygon limits', () => {
  const value = hamlets.normalizeHamletInput(input);
  assert.equal(value.name, 'Slåtta Øst'); assert.equal(value.reviewed, false);
  assert.equal(value.vertices, 4); assert.ok(value.areaM2 > 0);
  for (const invalid of [null, [], { ...input, action: 'delete' }, { ...input, name: '' }, { ...input, name: 'x'.repeat(101) },
    { ...input, name: 'a\nb' }, { ...input, reviewed: 'true' }, { ...input, polygon: null },
    { ...input, polygon: { type: 'Point', coordinates: [9.5,60.4] } },
    { ...input, action: 'save', id: '1; DROP', version: 1 },
    ...[null, undefined, '1', 0, -1, 1.5, 2147483647].map((version) => ({ ...input, action: 'save', id: '1', version })),
  ]) assert.throws(() => hamlets.normalizeHamletInput(invalid), MapError);
});

test('stored hamlets strip caller properties and do not claim official geographic authority', () => {
  const value = hamlets.normalizeHamletInput({ ...input, reviewed: true, polygon: { type: 'Feature', geometry: square, properties: { source: 'Kartverket', owners: ['private'], name: 'not authoritative' } } });
  assert.deepEqual(value.geometry, square);
  const result = hamlets.hamletRecord({ ...row, polygon: value.geometry });
  assert.equal(result.polygon.properties.name, row.name);
  assert.match(result.source, /Turufjell vel/);
  assert.doesNotMatch(JSON.stringify(result), /Kartverket|owners|private/);
  const clear = hamlets.normalizeHamletInput({ action: 'clear', id: '1', version: 2 });
  assert.equal(clear.geometry, null); assert.equal(clear.name, null); assert.equal(clear.reviewed, false);
  assert.equal(hamlets.hamletRecord({ ...row, polygon: null }).polygon, null);
});

async function service({ denied, mock = false, failure, rows = [row] } = {}) {
  const calls = [];
  const api = await loadModule('lib/map/hamlet-service.js', {
    '../admin-access.js': { requirePermission: async (p) => { assert.equal(p, 'members'); if (denied) throw new Error(denied); return { email: 'ADMIN@example.test' }; } },
    '../db.js': { getSql: () => ({ query: async (text, args) => { calls.push({ text, args }); if (failure) throw failure; return rows; } }) },
    '../mock-store.js': { isMockMode: () => mock }, './geo.js': { MapError }, './hamlets.js': hamlets,
  });
  return { ...api, calls };
}

test('hamlet service checks permissions, rejects mock writes and returns only active grends', async () => {
  for (const denied of ['Unauthorized', 'Forbidden']) {
    const s = await service({ denied });
    await assert.rejects(s.getMapHamlets(), new RegExp(denied));
    await assert.rejects(s.saveMapHamlet(input), new RegExp(denied)); assert.equal(s.calls.length, 0);
  }
  const mock = await service({ mock: true });
  assert.deepEqual(plain(await mock.getMapHamlets()), []);
  await assert.rejects(mock.saveMapHamlet(input), (e) => e.status === 409); assert.equal(mock.calls.length, 0);
  const s = await service(); await s.getMapHamlets(); assert.match(s.calls[0].text, /deleted_at IS NULL/);
});

test('save geometry and minimal actor audit atomically; never modify member assignments', async () => {
  const s = await service();
  const result = await s.saveMapHamlet(input); assert.equal(result.name, row.name);
  assert.equal(s.calls.length, 1);
  const { text, args } = s.calls[0];
  assert.match(text, /INSERT INTO member_hamlets/); assert.match(text, /INSERT INTO audit_log/);
  assert.equal(args[3], 'admin@example.test'); assert.deepEqual(JSON.parse(args[1]), square);
  assert.doesNotMatch(args[4], /coordinates|owners|emails/);
  for (const action of ['save', 'clear']) {
    await s.saveMapHamlet({ ...input, action, id: '1', version: 1 });
    assert.match(s.calls.at(-1).text, /polygon_version = \$7 AND deleted_at IS NULL/);
  }
  assert.ok(s.calls.every(({ text }) => !/UPDATE members\b|DELETE FROM|TRUNCATE/.test(text)));
  assert.equal(s.calls.at(-1).args[1], null);
});

test('stale version, deletion, duplicate names and failed audit never report success', async () => {
  const missing = await service({ rows: [] });
  await assert.rejects(missing.saveMapHamlet({ ...input, action: 'save', id: '1', version: 1 }), (e) => e.status === 409);
  const duplicate = await service({ failure: Object.assign(new Error('duplicate'), { code: '23505' }) });
  await assert.rejects(duplicate.saveMapHamlet(input), (e) => e.status === 409 && /allerede/.test(e.message));
  const failure = await service({ failure: new Error('audit failed') });
  await assert.rejects(failure.saveMapHamlet(input), /audit failed/);
});

test('actual hamlet GET/POST routes enforce auth, CSRF, limits and private responses', async () => {
  for (const [denied, expected] of [[null, 200], ['Unauthorized', 401], ['Forbidden', 403]]) {
    let calls = 0;
    const { handleMapRequest } = await loadModule('lib/map/api.js', {
      '../admin-access.js': { requirePermission: async () => { if (denied) throw new Error(denied); return { email: 'test@example.test' }; } },
      '../rate-limit.js': { isRateLimited: () => false }, './geo.js': { MapError }, './http.js': { readLimitedJson },
    });
    const route = await loadModule('app/api/admin/map/hamlets/route.js', {
      '@/lib/map/api': { handleMapRequest }, '@/lib/map/hamlet-service': {
        getMapHamlets: async () => { calls++; return []; }, saveMapHamlet: async () => { calls++; return hamlets.hamletRecord(row); },
      },
    });
    for (const method of ['GET', 'POST']) {
      const r = await route[method](request('/api/admin/map/hamlets', { method, ...(method === 'POST' ? { body: input } : {}) }));
      assert.equal(r.status, expected); assert.match(r.headers.get('Cache-Control'), /private/);
    }
    assert.equal(calls, denied ? 0 : 2);
    if (!denied) {
      for (const [options, status] of [[{ body: input, headers: { origin: 'https://evil.test' } }, 403],
        [{ body: { text: 'x'.repeat(33000) } }, 413], [{ rawBody: '{}' }, 415]]) {
        assert.equal((await route.POST(request('/api/admin/map/hamlets', { method: 'POST', ...options }))).status, status);
      }
      assert.equal(calls, 2);
    }
  }
});
