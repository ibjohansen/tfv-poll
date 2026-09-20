import Select from "@/components/Select";
import AutoFilterForm from '@/components/AutoFilterForm';
import Link from 'next/link';
import { AUDIT_SOURCES, auditPageHref } from '@/lib/audit-filters';
import { getServerI18n } from '@/lib/i18n/server';

function formatDate(value, locale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'medium', timeZone: 'Europe/Oslo' }).format(new Date(value));
}

function formatValue(value, t) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? t('yes') : t('no');
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function changedFields(entry, t, locale) {
  const before = entry.before_value || {};
  const after = entry.after_value || {};
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .sort((left, right) => t(`fields.${left}`, {}, left).localeCompare(t(`fields.${right}`, {}, right), locale));
}

function entityLabel(entry, t) {
  const value = entry.after_value || entry.before_value || {};
  if (value.action?.startsWith('hamlet_polygon_')) return t(value.action === 'hamlet_polygon_clear' ? 'entities.hamletCleared' : 'entities.hamletSaved', {name: value.name});
  if (value.action === 'hamlet_members_sync') return t('entities.hamletSync', {count: value.changed_count || 0});
  if (value.action === 'hamlet_members_bulk_assignment') return t('entities.hamletBulk', {count: value.changed_count || 0});
  if (value.action === 'newsletter_saved') return t('entities.newsletterSaved');
  if (value.action === 'newsletter_queued') return t('entities.newsletterQueued');
  if (entry.table_name === 'newsletter_campaigns') return t(value.action === 'campaign_started' ? 'entities.newsletterStarted' : 'entities.newsletterFinished');
  if (['email_campaigns', 'email_deliveries'].includes(entry.table_name)) return t(({ campaign_created: 'entities.campaignCreated', campaign_started: 'entities.campaignStarted', campaign_finished: 'entities.campaignFinished', testmail_requested: 'entities.testRequested', testmail_finished: 'entities.testFinished' })[value.action] || 'entities.emailEvent');
  if (entry.table_name === 'admin_actions' && value.action?.startsWith('group_')) return t('entities.group', {kind: t(value.kind === 'hamlet' ? 'entities.hamlet' : 'entities.emailGroup'), action: t(`entities.${value.action}`, {}, value.action)});
  if (entry.table_name === 'members') return t('entities.member', {id: value.h_number || `#${entry.row_id}`});
  if (entry.table_name === 'member_requests') return t(value.request_type === 'membership' ? 'entities.membership' : 'entities.ownership', {id: value.h_number || `#${entry.row_id}`});
  if (entry.table_name === 'surveys') return value.title || t('entities.survey', {id: entry.row_id});
  if (entry.table_name === 'survey_responses') return t('entities.response', {id: entry.row_id});
  if (entry.table_name === 'cms_pages') return value.title || t('entities.webPage', {id: entry.row_id});
  if (entry.table_name === 'admin_actions') return t(({ member_export: 'entities.memberExport', survey_results_export: 'entities.surveyExport', map_export: 'entities.mapExport', matrikkel_approve: 'entities.matrikkelApprove', matrikkel_cancel: 'entities.matrikkelCancel', matrikkel_hide: 'entities.matrikkelHide' })[value.action] || 'entities.adminAction');
  return value.original_filename || t('entities.attachment', {id: entry.row_id});
}

function entityHref(entry) {
  if (entry.after_value?.action?.startsWith('hamlet_polygon_')
    || ['hamlet_members_sync', 'hamlet_members_bulk_assignment'].includes(entry.after_value?.action)) return '/admin/map';
  if (entry.after_value?.newsletter_id) return '/admin/members/newsletters';
  if (['email_campaigns', 'email_deliveries'].includes(entry.table_name)) return '/admin/surveys';
  if (entry.table_name === 'admin_actions' && entry.after_value?.action?.startsWith('group_')) return '/admin/members/groups';
  if (entry.table_name === 'admin_actions' && entry.after_value?.action?.startsWith('matrikkel_')) return '/admin/members/matrikkel';
  if (entry.table_name === 'members') return `/admin/members?member=${encodeURIComponent(entry.row_id)}`;
  if (entry.table_name === 'member_requests') return '/admin/inbox';
  if (entry.table_name === 'member_profile_updates') return '/admin/inbox';
  if (['surveys', 'survey_responses'].includes(entry.table_name)) return '/admin/surveys';
  if (['cms_pages', 'cms_attachments'].includes(entry.table_name)) return '/admin/web';
  return null;
}

export default async function AdminAuditLog({ data, filters, tables }) {
  const { t, locale } = await getServerI18n('admin.auditLog');
  const { source, table, q, from, to, operation, status } = filters;
  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize));
  return <section className="admin-audit" aria-labelledby="audit-title">
    <div className="admin-section-header"><div><p className="eyebrow">{t('eyebrow')}</p><h2 id="audit-title">{t('title')}</h2><p>{t('help')}</p></div><span>{data.total}</span></div>
    <AutoFilterForm key={JSON.stringify(filters)} className="admin-audit-filters" action="/admin/audit">
      <label>{t('source')}<Select name="source" defaultValue={source}><option value="">{t('allSources')}</option>{AUDIT_SOURCES.map((value) => <option value={value} key={value}>{t(`sources.${value}`)}</option>)}</Select></label>
      <label>{t('area')}<Select name="table" defaultValue={table}><option value="">{t('allAreas')}</option>{tables.map((value) => <option value={value} key={value}>{t(`tables.${value}`, {}, value)}</option>)}</Select></label>
      <label>{t('search')}<input name="q" type="search" defaultValue={q} maxLength={200} placeholder={t('searchPlaceholder')} /></label>
      <label>{t('changeType')}<Select name="operation" defaultValue={operation}><option value="">{t('allTypes')}</option>{['INSERT', 'UPDATE', 'DELETE'].map((value) => <option key={value} value={value}>{t(`operations.${value}`)}</option>)}</Select></label>
      <label>{t('status')}<input name="status" defaultValue={status} maxLength={80} placeholder={t('statusPlaceholder')} /></label>
      <label>{t('from')}<input name="from" type="date" defaultValue={from} max={to || '9998-12-31'} /></label>
      <label>{t('to')}<input name="to" type="date" defaultValue={to} min={from || undefined} max="9998-12-31" /></label>
      {(source || table || q || from || to || operation || status) && <Link href="/admin/audit">{t('reset')}</Link>}
    </AutoFilterForm>
    {!data.entries.length ? <p className="admin-inbox-empty">{t('noResults')}</p> : <ol className="admin-audit-list">{data.entries.map((entry) => {
      const fields = changedFields(entry, t, locale);
      const href = entityHref(entry);
      return <li key={entry.id}>
        <div className="admin-audit-summary"><div><span className={`admin-audit-operation is-${entry.operation.toLowerCase()}`}>{entry.table_name === 'admin_actions' ? t('performed') : t(`operations.${entry.operation}`)}</span><strong>{t(`tables.${entry.table_name}`, {}, entry.table_name)} · {entityLabel(entry, t)}</strong></div><time dateTime={entry.changed_at}>{formatDate(entry.changed_at, locale)}</time></div>
        <p>{t('performedBy')} <strong>{entry.changed_by}</strong>{fields.length && entry.table_name !== 'admin_actions' ? t('changedFields', {count: fields.length}) : ''}</p>
        <div className="admin-audit-actions">{href && <Link href={href}>{t('openRecord')}</Link>}<details><summary>{t('fullLog')}</summary><div className="admin-audit-values">{fields.map((field) => <section key={field}><h3>{t(`fields.${field}`, {}, field)}</h3><div><div><span>{t('before')}</span><pre>{formatValue(entry.before_value?.[field], t)}</pre></div><div><span>{t('after')}</span><pre>{formatValue(entry.after_value?.[field], t)}</pre></div></div></section>)}</div></details></div>
      </li>;
    })}</ol>}
    {pageCount > 1 && <nav className="admin-pagination" aria-label={t('pages')}>{data.page > 1 && <Link href={auditPageHref(data.page - 1, filters)}>{t('previous')}</Link>}<span>{t('page', {page: data.page, count: pageCount})}</span>{data.page < pageCount && <Link href={auditPageHref(data.page + 1, filters)}>{t('next')}</Link>}</nav>}
  </section>;
}
