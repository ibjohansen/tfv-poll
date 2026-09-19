import Link from 'next/link';
import { notFound } from 'next/navigation';
import CmsPageView from '@/components/CmsPageView';
import { getAdminCmsPage } from '@/lib/cms-pages';
import { getServerI18n } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function CmsPreviewPage({ params }) {
  const { t } = await getServerI18n('cms.preview');
  let page;
  try {
    page = await getAdminCmsPage((await params).id);
  } catch {
    notFound();
  }
  if (!page) notFound();
  return (
    <main id="main-content" className="cms-preview-page" tabIndex={-1}>
      <div className="cms-preview-bar"><div><strong>{t('title')}</strong><span>{page.status === 'published' ? t('published') : t('draft')}</span></div><Link href="/admin/web">{t('back')}</Link></div>
      <div className="cms-public-main"><CmsPageView page={page} preview /></div>
    </main>
  );
}
