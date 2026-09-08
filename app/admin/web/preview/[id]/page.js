import Link from 'next/link';
import { notFound } from 'next/navigation';
import CmsPageView from '@/components/CmsPageView';
import { getAdminCmsPage } from '@/lib/cms-pages';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function CmsPreviewPage({ params }) {
  let page;
  try {
    page = await getAdminCmsPage((await params).id);
  } catch {
    notFound();
  }
  if (!page) notFound();
  return (
    <main className="cms-preview-page">
      <div className="cms-preview-bar"><div><strong>Forhåndsvisning</strong><span>{page.status === 'published' ? 'Publisert' : 'Utkast'}</span></div><Link href="/admin/web">Tilbake til CMS</Link></div>
      <div className="cms-public-main"><CmsPageView page={page} preview /></div>
    </main>
  );
}
