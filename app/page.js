import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import SiteHeader from '@/components/SiteHeader';
import HomeHeroCarousel from '@/components/HomeHeroCarousel';
import PublicArticleDirectory from '@/components/PublicArticleDirectory';
import MemberSelfServiceEntry from '@/components/MemberSelfServiceEntry';
import PublicHamletMap from '@/components/PublicHamletMap';
import { auth } from '@/auth';
import { isAllowedAdmin } from '@/lib/admin-policy';
import { getPublishedCmsPage, getPublishedCmsPageSummaries } from '@/lib/cms-pages';
import { isValidCmsSlug } from '@/lib/cms-validation';
import { getPublicMapHamlets } from '@/lib/map/public-map-service';
import { carouselImagesFromFilenames } from '@/lib/public-carousel';
import { getServerI18n } from '@/lib/i18n/server';
import { PUBLIC_CMS_CACHE_TAG, PUBLIC_HAMLETS_CACHE_TAG } from '@/lib/public-content-cache';

export const runtime = 'nodejs';

async function getCarouselImages() {
  try {
    const filenames = await readdir(join(process.cwd(), 'public', 'carousel'));
    return carouselImagesFromFilenames(filenames);
  } catch {
    return [];
  }
}

const getCachedCarouselImages = unstable_cache(getCarouselImages, ['home-carousel-images']);
const getCachedPublishedCmsPageSummaries = unstable_cache(
  () => getPublishedCmsPageSummaries(6),
  ['home-published-cms-pages'],
  { revalidate: 300, tags: [PUBLIC_CMS_CACHE_TAG] },
);
const getCachedPublicMapHamlets = unstable_cache(
  getPublicMapHamlets,
  ['home-public-map-hamlets'],
  { revalidate: 300, tags: [PUBLIC_HAMLETS_CACHE_TAG] },
);

async function safely(promise, fallback) {
  try { return await promise; } catch { return fallback; }
}

export default async function HomePage({ searchParams }) {
  const [i18n, session, params, carouselImages, pages, hamlets] = await Promise.all([
    getServerI18n(),
    auth(),
    Promise.resolve(searchParams),
    getCachedCarouselImages(),
    safely(getCachedPublishedCmsPageSummaries(), []),
    safely(getCachedPublicMapHamlets(), []),
  ]);
  const { t } = i18n;
  const isAdmin = isAllowedAdmin(session?.user);
  let initialPage = null;
  const requestedArticle = String(params?.article || '');
  if (isValidCmsSlug(requestedArticle)) {
    try {
      initialPage = await getPublishedCmsPage(requestedArticle);
    } catch {
      // Oversikten skal fortsatt kunne vises dersom én artikkel ikke kan hentes.
    }
  }
  return (
    <div className="brand-public-home min-h-dvh bg-background text-foreground">
      <a className="fixed top-3 left-3 z-50 -translate-y-24 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-foreground shadow-lg transition-transform focus:translate-y-0 focus:outline-2 focus:outline-offset-2 focus:outline-primary" href="#main-content">{t('general.navigation.skipToContent')}</a>
      <SiteHeader />
      <main id="main-content">
        <HomeHeroCarousel images={carouselImages.length ? carouselImages : [{
          id: 'fallback',
          src: '/turufjell.jpeg',
          photographer: null,
          number: 0,
        }]} />

        <section className="relative flex min-h-[32rem] items-center justify-center overflow-hidden px-5 py-20 text-center sm:px-8" aria-labelledby="about-title">
          <div className="mx-auto max-w-3xl">
            <p className="relative z-10 mt-7 text-base leading-8 text-[#6F645E] sm:text-lg sm:leading-9">{t('public.home.about')}</p>
            <a href="mailto:post@turufjellvel.no" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-light focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">{t('public.home.contact')} <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-none stroke-current stroke-2"><path d="m9 18 6-6-6-6" /></svg></a>
          </div>
        </section>

        <PublicHamletMap hamlets={JSON.parse(JSON.stringify(hamlets))} />
        <MemberSelfServiceEntry membershipStatus={String(params?.membership || '')} />
        {pages.length > 0 && <PublicArticleDirectory pages={pages} initialPage={initialPage} />}
      </main>
      <footer className="border-t border-foreground/15 bg-background">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 py-9 text-sm text-[#6F645E] sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-7">
            <address className="not-italic"><span className="font-semibold text-foreground">{t('general.footer.address')}</span> Elvemo 18, 3539 Flå</address>
            <p><span className="font-semibold text-foreground">{t('general.footer.email')}</span> <a className="font-medium text-primary-dark hover:text-primary focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary" href="mailto:post@turufjellvel.no">post@turufjellvel.no</a></p>
            <p><span className="font-semibold text-foreground">{t('general.footer.organizationNumber')}</span> 928 968 898</p>
          </div>
          <Link href={isAdmin ? '/admin' : '/admin/login'} className="inline-flex w-fit items-center gap-2 font-semibold text-primary-dark hover:text-primary focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">{isAdmin ? t('general.navigation.adminPortal') : t('general.navigation.boardLogin')} <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-none stroke-current stroke-2"><path d="m9 18 6-6-6-6" /></svg></Link>
        </div>
      </footer>
    </div>
  );
}
