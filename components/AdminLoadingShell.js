'use client';

import { useI18n } from '@/components/LocaleProvider';

export default function AdminLoadingShell({ titleKey = 'admin' }) {
  const { t } = useI18n('general.loading');
  const title = t(titleKey);
  return <section className="admin-content admin-loading-content" role="status" aria-label={title} aria-busy="true">
      <div className="admin-loading-card"><span className="admin-loading-line is-heading" /><span className="admin-loading-line" /><span className="admin-loading-line is-short" /></div>
      <div className="admin-loading-card"><span className="admin-loading-line is-heading" /><span className="admin-loading-line" /><span className="admin-loading-line" /><span className="admin-loading-line is-short" /></div>
  </section>;
}
