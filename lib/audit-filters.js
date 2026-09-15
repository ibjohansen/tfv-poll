export const AUDITED_TABLES = ['members', 'member_requests', 'surveys', 'survey_responses', 'cms_pages', 'cms_attachments', 'admin_actions'];

function dateFilter(value) {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid audit date');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < '0001-01-01' || value > '9998-12-31') throw new Error('Invalid audit date');
  return value;
}

export function normalizeAuditFilters(input = {}) {
  const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const from = dateFilter(input.from);
  const to = dateFilter(input.to);
  if (from && to && from > to) throw new Error('Invalid audit date range');
  const page = Number(input.page);
  return {
    q: text(input.q, 200), actor: text(input.actor, 320),
    table: AUDITED_TABLES.includes(input.table) ? input.table : '',
    operation: ['INSERT', 'UPDATE', 'DELETE'].includes(input.operation) ? input.operation : '',
    status: text(input.status, 80), from, to,
    page: Number.isFinite(page) ? Math.max(1, Math.min(Math.floor(page), 10000)) : 1,
  };
}

export function auditPageHref(page, filters) {
  const query = new URLSearchParams(Object.entries({ ...filters, page: String(page) }).filter(([, value]) => value !== ''));
  return `/admin/audit?${query}`;
}
