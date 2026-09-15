import 'server-only';
import { requirePermission } from './admin-access.js';
import { getSql } from './db.js';
import { isMockMode } from './mock-store.js';
import { AUDITED_TABLES, normalizeAuditFilters } from './audit-filters.js';

export async function getAdminAuditLog(input = {}) {
  await requirePermission('audit');
  const filters = normalizeAuditFilters(input);
  if (isMockMode()) return { entries: [], actors: [], total: 0, page: 1, pageSize: 50 };
  const pageSize = 50;
  const sql = getSql();
  const values = [];
  const conditions = [];
  const add = (value, expression) => { values.push(value); conditions.push(expression(`$${values.length}`)); };
  if (filters.actor) add(filters.actor, (p) => `changed_by = ${p}`);
  if (filters.table) add(filters.table, (p) => `table_name = ${p}`);
  if (filters.operation) add(filters.operation, (p) => `operation = ${p}`);
  if (filters.status) add(filters.status, (p) => `COALESCE(after_value->>'status', before_value->>'status') = ${p}`);
  if (filters.from) add(filters.from, (p) => `changed_at >= (${p}::date::timestamp AT TIME ZONE 'Europe/Oslo')`);
  if (filters.to) add(filters.to, (p) => `changed_at < ((${p}::date + INTERVAL '1 day') AT TIME ZONE 'Europe/Oslo')`);
  if (filters.q) add(filters.q, (p) => `strpos(lower(concat_ws(' ', changed_by, row_id, before_value::text, after_value::text)), lower(${p})) > 0`);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [[{ count }], actors] = await Promise.all([
    sql.query(`SELECT COUNT(*)::int AS count FROM admin_activity_log ${where}`, values),
    sql`SELECT DISTINCT changed_by FROM admin_activity_log ORDER BY changed_by LIMIT 500`,
  ]);
  // Neon drivers may return aggregate values as strings depending on the
  // runtime/connection mode. Normalize before doing pagination arithmetic so
  // an invalid value can never become a SQL `OFFSET NaN` parameter.
  const total = Number.isFinite(Number(count)) ? Number(count) : 0;
  const safePage = Math.min(filters.page, Math.max(1, Math.ceil(total / pageSize)));
  const entries = await sql.query(`
    SELECT id, table_name, row_id, operation, changed_by, before_value, after_value, changed_at
    FROM admin_activity_log
    ${where}
    ORDER BY changed_at DESC, id DESC
    LIMIT $${values.length + 1} OFFSET $${values.length + 2}
  `, [...values, pageSize, (safePage - 1) * pageSize]);
  return {
    entries: entries.map((entry) => ({ ...entry, changed_at: new Date(entry.changed_at).toISOString() })),
    actors: actors.map(({ changed_by: changedBy }) => changedBy),
    total,
    page: safePage,
    pageSize,
  };
}

export function getAuditedTables() {
  return [...AUDITED_TABLES];
}
