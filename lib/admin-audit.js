import 'server-only';
import { requireAdmin } from './admin-access.js';
import { getSql } from './db.js';
import { isMockMode } from './mock-store.js';

const auditedTables = new Set(['members', 'member_requests', 'surveys', 'survey_responses', 'cms_pages', 'cms_attachments']);

export async function getAdminAuditLog({ actor = '', table = '', page = 1 } = {}) {
  await requireAdmin();
  if (isMockMode()) return { entries: [], actors: [], total: 0, page: 1, pageSize: 50 };
  const safeActor = typeof actor === 'string' ? actor.trim().slice(0, 320) : '';
  const safeTable = auditedTables.has(table) ? table : '';
  const pageSize = 50;
  const requestedPage = Math.max(1, Math.min(Number(page) || 1, 10000));
  const sql = getSql();
  const [{ count }, actors] = await Promise.all([
    sql`
      SELECT COUNT(*)::int AS count FROM audit_log
      WHERE (${safeActor} = '' OR changed_by = ${safeActor})
        AND (${safeTable} = '' OR table_name = ${safeTable})
    `,
    sql`SELECT DISTINCT changed_by FROM audit_log ORDER BY changed_by LIMIT 500`,
  ]);
  const safePage = Math.min(requestedPage, Math.max(1, Math.ceil(count / pageSize)));
  const entries = await sql`
    SELECT id, table_name, row_id, operation, changed_by, before_value, after_value, changed_at
    FROM audit_log
    WHERE (${safeActor} = '' OR changed_by = ${safeActor})
      AND (${safeTable} = '' OR table_name = ${safeTable})
    ORDER BY changed_at DESC, id DESC
    LIMIT ${pageSize} OFFSET ${(safePage - 1) * pageSize}
  `;
  return {
    entries: entries.map((entry) => ({ ...entry, changed_at: new Date(entry.changed_at).toISOString() })),
    actors: actors.map(({ changed_by: changedBy }) => changedBy),
    total: count,
    page: safePage,
    pageSize,
  };
}

export function getAuditedTables() {
  return [...auditedTables];
}
