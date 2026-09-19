import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import { getServerI18n } from '@/lib/i18n/server';

export default async function CmsNotFound() {
  const { t } = await getServerI18n('cms.notFound');
  return <div className="cms-public-page"><SiteHeader /><main id="main-content" className="cms-public-main" tabIndex={-1}><section className="cms-not-found"><p className="eyebrow">404</p><h1>{t('title')}</h1><p>{t('description')}</p><Link href="/">{t('home')}</Link></section></main></div>;
}
