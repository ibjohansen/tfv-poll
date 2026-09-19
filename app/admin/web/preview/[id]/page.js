import Link from 'next/link';
import { notFound } from 'next/navigation';
import CmsPreviewFrame from '@/components/CmsPreviewFrame';
import { getAdminCmsPage, getAdminCmsPageRevision } from '@/lib/cms-pages';
import { getServerI18n } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata = { robots: { index: false, follow: false } };

export default async function CmsPreviewPage({ params, searchParams }) {
  const { t } = await getServerI18n('cms.preview');
  let page;
  try {
    const id = (await params).id;
    const revision = Number((await searchParams).revision);
    page = Number.isInteger(revision) && revision > 0 ? await getAdminCmsPageRevision(id, revision) : await getAdminCmsPage(id);
  } catch {
    notFound();
  }
  if (!page) notFound();
  return (
    <main id="main-content" className="cms-preview-page" tabIndex={-1}>
      <div className="cms-preview-bar"><div><strong>{t('title')}</strong><span>{page.status === 'published' ? t('published') : t('draft')}</span><span>Revisjon {page.version}</span></div><Link href={`/admin/web/${page.id}`}>{t('back')}</Link></div>
      <CmsPreviewFrame page={page} />
    </main>
  );
}
