'use client';
import { useI18n } from '@/components/LocaleProvider';

export default function CmsEditorError({ reset }) {
  const { t } = useI18n('cms.admin');
  return <section className="admin-content"><h2>{t('openError')}</h2><p>{t('reloadHelp')}</p><button className="primary-button" type="button" onClick={reset}>{t('retry')}</button></section>;
}
