import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAuditFilters, auditPageHref } from '../lib/audit-filters.js';
import { recordAdminExport } from '../lib/admin-activity.js';
import { loadModule, plain } from './helpers/load-module.mjs';
import * as filters from '../lib/audit-filters.js';

async function setup(options = {}) {
  const state = { count: '125', denied: false, mock: false, ...options }, queries = [];
  const sql = async () => [{ changed_by: 'admin@example.test' }];
  sql.query = async (query, values) => {
    queries.push({ query, values });
    if (query.includes('COUNT(*)')) return [{ count: state.count }];
    return [{ id: '1', changed_at: '2026-09-14T12:00:00Z', changed_by: 'admin@example.test' }];
  };
  const api = await loadModule('lib/admin-audit.js', {
    './admin-access.js': { requirePermission: async permission => { assert.equal(permission, 'audit'); if (state.denied) throw new Error('Forbidden'); } },
    './db.js': { getSql: () => sql }, './mock-store.js': { isMockMode: () => state.mock },
    './audit-filters.js': filters,
  });
  return { api, state, queries };
}

test('audit total unwraps the aggregate row and supports subsequent pages', async () => {
  const { api, queries } = await setup();
  const data = await api.getAdminAuditLog({ page: 2 });
  assert.equal(data.total, 125);
  assert.equal(data.page, 2);
  assert.equal(data.entries[0].changed_at, '2026-09-14T12:00:00.000Z');
  assert.deepEqual(plain(queries[1].values), [50, 50]);
});

test('audit paging clamps page bounds and never sends fractional or invalid offsets', async () => {
  const { api, queries, state } = await setup();
  for (const [input, expected] of [[-1, 1], [1.5, 1], [Infinity, 1], ['NaN', 1], [99999, 3]]) {
    assert.equal((await api.getAdminAuditLog({ page: input })).page, expected);
    assert.equal(queries.at(-1).values.at(-1), (expected - 1) * 50);
  }
  state.count = 'unexpected';
  assert.equal((await api.getAdminAuditLog()).total, 0);
});

test('audit combines server-side filters with bound values and Oslo date boundaries', async () => {
  const { api, queries } = await setup();
  const input = { q: "test%' OR 1=1 --", source: 'public', table: 'member_requests', operation: 'UPDATE', status: 'approved', from: '2026-03-29', to: '2026-03-29', page: 2 };
  await api.getAdminAuditLog(input);
  assert.doesNotMatch(queries[0].query, /OR 1=1/);
  assert.ok(queries[0].values.includes(input.q));
  assert.deepEqual(plain(queries[0].values), plain(queries[1].values.slice(0, -2)));
  for (const q of queries) {
    assert.match(q.query, /changed_at >=/);
    assert.match(q.query, /changed_at </);
    assert.match(q.query, /AT TIME ZONE 'Europe\/Oslo'/);
    assert.match(q.query, /INTERVAL '1 day'/);
    assert.match(q.query, /strpos\(lower/);
    assert.match(q.query, /COALESCE\(after_value->>'status'/);
    assert.match(q.query, /WHEN changed_by ~\* '\^\(member\|applicant\):' THEN 'public'/);
  }
  const link = new URL(auditPageHref(3, normalizeAuditFilters(input)), 'https://example.test');
  assert.equal(link.searchParams.get('q'), input.q);
  assert.equal(link.searchParams.get('from'), input.from);
  assert.equal(link.searchParams.get('page'), '3');
});

test('invalid dates fail before SQL and search inputs are bounded', async () => {
  const { api, queries } = await setup();
  for (const from of ['2026-02-30', '2026-13-01', '2026-2-01', "'; DELETE FROM audit_log", [], '0000-01-01']) await assert.rejects(api.getAdminAuditLog({ from }), /Invalid audit date/);
  await assert.rejects(api.getAdminAuditLog({ from: '2026-09-02', to: '2026-09-01' }), /range/);
  assert.equal(queries.length, 0);
  const normalized = normalizeAuditFilters({ q: 'x'.repeat(201), source: 'unknown', operation: 'DROP', table: 'passwords' });
  assert.equal(normalized.q.length, 200);
  assert.equal(normalized.source, '');
  assert.equal(normalized.operation, '');
  assert.equal(normalized.table, '');
});

test('audit permission is checked even in mock mode', async () => {
  const { api, state, queries } = await setup({ denied: true, mock: true });
  await assert.rejects(api.getAdminAuditLog(), /Forbidden/);
  state.denied = false;
  assert.equal((await api.getAdminAuditLog()).entries.length, 0);
  assert.equal(queries.length, 0);
});

test('export activity stores only allowlisted metadata and a normalized actor', async () => {
  const calls = [];
  const sql = async (strings, ...values) => { calls.push({ query: strings.join('?'), values }); };
  await recordAdminExport(sql, { actor: ' Admin@Example.test ', action: 'member_export', count: 12, scope: 'selected', surveyId: 'a'.repeat(32), token: 'secret', members: [{ email: 'private@example.test' }] });
  assert.match(calls[0].query, /INSERT INTO audit_log/);
  assert.equal(calls[0].values[1], 'admin@example.test');
  assert.deepEqual(JSON.parse(calls[0].values[2]), { action: 'member_export', count: 12, scope: 'selected', survey_id: 'a'.repeat(32) });
  assert.doesNotMatch(JSON.stringify(calls), /private@example|secret/);
  await assert.rejects(recordAdminExport(sql, { actor: 'a', action: 'unknown', count: 1, scope: 'all', surveyId: 'a'.repeat(32) }), /Invalid audit event/);
  assert.equal(calls.length, 1);
});

test('member export is logged after workbook creation and is not returned if logging fails', async () => {
  const order = [];
  const queries = [];
  let denied = false, logError = false;
  const sql = async strings => { const query = strings.join(''); queries.push(query); return query.includes('FROM surveys') ? [{ id: 'a'.repeat(32) }] : [{ h_number: '7' }]; };
  const api = await loadModule('lib/member-export.js', {
    './admin-access.js': { requirePermission: async () => { order.push('auth'); if (denied) throw new Error('Forbidden'); return { email: 'admin@example.test' }; } },
    './db.js': { getSql: () => { order.push('database'); return sql; } },
    './mock-store.js': { isMockMode: () => false },
    './member-workbook.js': { buildMemberWorkbook: async () => { order.push('workbook'); return Buffer.from('export'); } },
    './admin-activity.js': { recordAdminExport: async (_sql, details) => { order.push('audit'); assert.equal(details.count, 1); if (logError) throw new Error('Audit unavailable'); } },
  });
  const input = { scope: 'all', surveyId: 'a'.repeat(32) };
  assert.equal((await api.createMemberExport(input)).buffer.toString(), 'export');
  assert.match(queries.join('\n'), /turufjell_as_sharing_opt_out = FALSE/);
  assert.deepEqual(order, ['auth', 'database', 'workbook', 'audit']);
  logError = true;
  await assert.rejects(api.createMemberExport(input), /Audit unavailable/);
  order.length = 0; denied = true;
  await assert.rejects(api.createMemberExport(input), /Forbidden/);
  assert.deepEqual(order, ['auth']);
});
