'use client';

import Link from 'next/link';
import { useI18n } from '@/components/LocaleProvider';

export default function AdminMatrikkelTasks({ tasks, canManage }) {
  const { t, formatLocale } = useI18n('members.requests');
  if (!tasks.length) return null;
  return <section className="admin-member-requests" aria-labelledby="monthly-matrikkel-tasks-title">
    <div className="admin-section-header"><div><p className="eyebrow">{t('monthlyEyebrow')}</p><h2 id="monthly-matrikkel-tasks-title">{t('monthlyTitle')}</h2></div><span>{tasks.length}</span></div>
    <div className="admin-member-request-list">{tasks.map((task) => {
      const month = new Date(task.scheduled_month).toLocaleDateString(formatLocale, { month: 'long', year: 'numeric' });
      return <article key={task.id}>
        <div className="admin-member-request-summary"><h3>{t('monthlyTask', {month})}</h3><p>{t('monthlySummary', {processed: task.processed_count, total: task.total_count})}</p><span className="admin-request-verification is-unverified">{t(`monthlyStatuses.${task.status}`, {}, task.status)}</span></div>
        <dl><div><dt>{t('monthlyUnchanged')}</dt><dd>{task.unchanged_count}</dd></div><div><dt>{t('monthlyReview')}</dt><dd>{task.review_count}</dd></div><div><dt>{t('monthlyErrors')}</dt><dd>{task.error_count}</dd></div></dl>
        {task.error_message && <p className="form-error">{task.error_message}</p>}
        <div className="admin-member-request-actions">{canManage
          ? <Link className="admin-button" href={`/admin/members/matrikkel?run=${task.id}`}>{t('openMonthly')}</Link>
          : <p>{t('monthlyPermission')}</p>}</div>
      </article>;
    })}</div>
  </section>;
}
