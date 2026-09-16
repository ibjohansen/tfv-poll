import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { getPublishedCmsPage } from '@/lib/cms-pages';
import { isValidCmsSlug } from '@/lib/cms-validation';
import { getServerI18n } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const loadPage = cache(async (slug) => {
  if (!isValidCmsSlug(slug)) return null;
  return getPublishedCmsPage(slug);
});

export async function generateMetadata({ params }) {
  const { t } = await getServerI18n('cms.notFound');
  const page = await loadPage((await params).slug);
  if (!page) return { title: t('metadata') };
  return {
    title: `${page.title} | Turufjell Vel`,
    description: page.intro || undefined,
    robots: { index: true, follow: true },
  };
}

export default async function PublicCmsPage({ params }) {
  const page = await loadPage((await params).slug);
  if (!page) notFound();
  redirect(`/?article=${encodeURIComponent(page.slug)}`);
}
