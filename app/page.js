import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import Link from 'next/link';
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

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function getCarouselImages() {
  try {
    const filenames = await readdir(join(process.cwd(), 'public', 'carousel'));
    return carouselImagesFromFilenames(filenames);
  } catch {
    return [];
  }
}

export default async function HomePage({ searchParams }) {
  const isAdmin = isAllowedAdmin((await auth())?.user);
  const params = await searchParams;
  const carouselImages = await getCarouselImages();
  let pages = [];
  let hamlets = [];
  let initialPage = null;
  try {
    pages = await getPublishedCmsPageSummaries(6);
  } catch {
    // Forsiden skal fortsatt fungere før CMS-tabellene er opprettet eller ved et kort databaseavbrudd.
  }
  try {
    hamlets = await getPublicMapHamlets();
  } catch {
    // Forsiden og selvbetjeningen skal fungere selv om kartdata ikke kan hentes.
  }
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
      <a className="fixed top-3 left-3 z-50 -translate-y-24 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-foreground shadow-lg transition-transform focus:translate-y-0 focus:outline-2 focus:outline-offset-2 focus:outline-primary" href="#main-content">Hopp til innhold</a>
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
            <p className="relative z-10 mt-7 text-base leading-8 text-[#6F645E] sm:text-lg sm:leading-9">Turufjell Vel er en ikke-økonomisk forening som har som formål å samordne og ivareta medlemmenes interesser i og omkring Turufjell hytteområde. Vellet skal utvikle og ivareta fellesskapet, og representere medlemmene overfor Flå kommune, Turufjell AS, grunneierne i og omkring hytteområdet og andre relevante aktører.</p>
            <a href="mailto:post@turufjellvel.no" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-light focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">Kontakt oss <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-none stroke-current stroke-2"><path d="m9 18 6-6-6-6" /></svg></a>
          </div>
        </section>

        <PublicHamletMap hamlets={JSON.parse(JSON.stringify(hamlets))} />
        <MemberSelfServiceEntry membershipStatus={String(params?.membership || '')} />
        {pages.length > 0 && <PublicArticleDirectory pages={pages} initialPage={initialPage} />}
      </main>
      <footer className="border-t border-foreground/15 bg-background">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 py-9 text-sm text-[#6F645E] sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-7">
            <address className="not-italic"><span className="font-semibold text-foreground">Adresse:</span> Elvemo 18, 3539 Flå</address>
            <p><span className="font-semibold text-foreground">E-post:</span> <a className="font-medium text-primary-dark hover:text-primary focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary" href="mailto:post@turufjellvel.no">post@turufjellvel.no</a></p>
            <p><span className="font-semibold text-foreground">Organisasjonsnummer:</span> 928 968 898</p>
          </div>
          <Link href={isAdmin ? '/admin' : '/admin/login'} className="inline-flex w-fit items-center gap-2 font-semibold text-primary-dark hover:text-primary focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">{isAdmin ? 'Åpne adminportal' : 'Login for styremedlemmer'} <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-none stroke-current stroke-2"><path d="m9 18 6-6-6-6" /></svg></Link>
        </div>
      </footer>
    </div>
  );
}
