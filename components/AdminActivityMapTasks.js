'use client';

import Link from 'next/link';
import { useI18n } from '@/components/LocaleProvider';

export default function AdminActivityMapTasks({ tasks, canManage }) {
  const { t, formatLocale } = useI18n('activityMap.tasks');
  if (!tasks.length) return null;
  return <section className="admin-member-requests" aria-labelledby="activity-map-tasks-title">
    <div className="admin-section-header"><div><p className="eyebrow">{t('eyebrow')}</p><h2 id="activity-map-tasks-title">{t('title')}</h2></div><span>{tasks.length}</span></div>
    <div className="admin-member-request-list">{tasks.map((task) => {
      const month = new Date(task.scheduled_month).toLocaleDateString(formatLocale, { month: 'long', year: 'numeric' });
      const summary = task.summary || {};
      return <article key={task.id}>
        <div className="admin-member-request-summary"><h3>{t('task', { month })}</h3><p>{task.status === 'failed' ? t('failedSummary') : t('summary')}</p>
          <span className="admin-request-verification is-unverified">{t(`statuses.${task.status}`, {}, task.status)}</span></div>
        <dl><div><dt>{t('new')}</dt><dd>{summary.new || 0}</dd></div><div><dt>{t('changed')}</dt><dd>{summary.changed || 0}</dd></div>
          <div><dt>{t('missing')}</dt><dd>{summary.missing || 0}</dd></div><div><dt>{t('matched')}</dt><dd>{summary.matched || 0}</dd></div></dl>
        <div className="admin-member-request-actions">{canManage
          ? <Link className="admin-button" href={`/admin/activity-map?run=${task.id}`}>{t('open')}</Link>
          : <p>{t('permission')}</p>}</div>
      </article>;
    })}</div>
  </section>;
}
