import Image from 'next/image';
import Link from 'next/link';
import landscape from '@/public/turufjell.jpeg';
import SiteHeader from '@/components/SiteHeader';
import PublicArticleDirectory from '@/components/PublicArticleDirectory';
import MemberSelfServiceEntry from '@/components/MemberSelfServiceEntry';
import { auth } from '@/auth';
import { isAllowedAdmin } from '@/lib/admin-policy';
import { getPublishedCmsPage, getPublishedCmsPageSummaries } from '@/lib/cms-pages';
import { isValidCmsSlug } from '@/lib/cms-validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function HomePage({ searchParams }) {
  const isAdmin = isAllowedAdmin((await auth())?.user);
  const params = await searchParams;
  let pages = [];
  let initialPage = null;
  try {
    pages = await getPublishedCmsPageSummaries(6);
  } catch {
    // Forsiden skal fortsatt fungere før CMS-tabellene er opprettet eller ved et kort databaseavbrudd.
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
    <div className="min-h-dvh bg-slate-50 text-slate-950">
      <a className="fixed top-3 left-3 z-50 -translate-y-24 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg transition-transform focus:translate-y-0 focus:outline-2 focus:outline-offset-2 focus:outline-primary" href="#main-content">Hopp til innhold</a>
      <SiteHeader />
      <main id="main-content">
        <section className="relative flex min-h-[clamp(26rem,60vh,46rem)] w-full items-end overflow-hidden bg-primary" aria-labelledby="home-title">
          <Image src={landscape} alt="Utsikt over fjellandskapet på Turufjell" fill sizes="100vw" priority className="object-cover object-[35%_center]" />
          <div className="absolute inset-0 bg-linear-to-t from-slate-950/75 via-slate-950/10 to-transparent" />
          <div className="relative mx-auto w-full max-w-7xl px-5 py-12 text-white sm:px-8 sm:py-16 lg:px-12 lg:py-20">
            <p className="text-xs font-semibold tracking-[0.2em] text-white/70 uppercase">Turufjell vel</p>
            <h1 id="home-title" className="mt-4 max-w-3xl text-4xl leading-[1.04] font-semibold tracking-[-0.045em] sm:text-6xl lg:text-7xl">Fellesskap på fjellet</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/80 sm:text-lg">Vi samordner og ivaretar medlemmenes interesser i og omkring Turufjell hytteområde.</p>
          </div>
        </section>

        <section className="flex min-h-[32rem] items-center justify-center px-5 py-20 text-center sm:px-8" aria-labelledby="about-title">
          <div className="mx-auto max-w-3xl">
            <p className="mt-7 text-base leading-8 text-slate-600 sm:text-lg sm:leading-9">Turufjell Vel er en ikke-økonomisk forening som har som formål å samordne og ivareta medlemmenes interesser i og omkring Turufjell hytteområde. Vellet skal utvikle og ivareta fellesskapet, og representere medlemmene overfor Flå kommune, Turufjell AS, grunneierne i og omkring hytteområdet og andre relevante aktører.</p>
            <a href="mailto:post@turufjellvel.no" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-light focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">Kontakt oss <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-none stroke-current stroke-2"><path d="m9 18 6-6-6-6" /></svg></a>
          </div>
        </section>

        <MemberSelfServiceEntry membershipStatus={String(params?.membership || '')} />
        {pages.length > 0 && <PublicArticleDirectory pages={pages} initialPage={initialPage} />}
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 py-9 text-sm text-slate-500 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-7">
            <address className="not-italic"><span className="font-semibold text-slate-700">Adresse:</span> Elvemo 18, 3539 Flå</address>
            <p><span className="font-semibold text-slate-700">E-post:</span> <a className="font-medium text-slate-600 hover:text-primary focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary" href="mailto:post@turufjellvel.no">post@turufjellvel.no</a></p>
            <p><span className="font-semibold text-slate-700">Organisasjonsnummer:</span> 928 968 898</p>
          </div>
          <Link href={isAdmin ? '/admin' : '/admin/login'} className="inline-flex w-fit items-center gap-2 font-semibold text-slate-700 hover:text-primary focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">{isAdmin ? 'Åpne adminportal' : 'Login for styremedlemmer'} <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-none stroke-current stroke-2"><path d="m9 18 6-6-6-6" /></svg></Link>
        </div>
      </footer>
    </div>
  );
}
