'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import SiteHeader from '@/components/SiteHeader';
import HomeHeroCarousel from '@/components/HomeHeroCarousel';
import PublicArticleDirectory from '@/components/PublicArticleDirectory';
import MemberSelfServiceEntry from '@/components/MemberSelfServiceEntry';
import PublicHamletMap from '@/components/PublicHamletMap';
import { useI18n } from '@/components/LocaleProvider';

export default function PublicHomePage({ carouselImages, pages, hamlets }) {
  const { t } = useI18n();
  return <div className="brand-public-home min-h-dvh bg-background text-foreground">
    <SiteHeader />
    <main id="main-content" tabIndex={-1}>
      <HomeHeroCarousel images={carouselImages} />
      <section className="relative flex min-h-[32rem] items-center justify-center overflow-hidden px-5 py-20 text-center sm:px-8" aria-labelledby="about-title">
        <div className="mx-auto max-w-3xl">
          <p className="relative z-10 mt-7 text-base leading-8 text-[#6F645E] sm:text-lg sm:leading-9">{t('public.home.about')}</p>
          <a href="mailto:post@turufjellvel.no" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-light focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">{t('public.home.contact')} <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-none stroke-current stroke-2"><path d="m9 18 6-6-6-6" /></svg></a>
        </div>
      </section>
      <PublicHamletMap hamlets={hamlets} />
      <Suspense fallback={null}><MemberSelfServiceEntry /></Suspense>
      {pages.length > 0 && <PublicArticleDirectory pages={pages} />}
    </main>
    <footer className="border-t border-foreground/15 bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 py-9 text-sm text-[#6F645E] sm:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-7">
          <address className="not-italic"><span className="font-semibold text-foreground">{t('general.footer.address')}</span> Elvemo 18, 3539 Flå</address>
          <p><span className="font-semibold text-foreground">{t('general.footer.email')}</span> <a className="font-medium text-primary-dark hover:text-primary focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary" href="mailto:post@turufjellvel.no">post@turufjellvel.no</a></p>
          <p><span className="font-semibold text-foreground">{t('general.footer.organizationNumber')}</span> 928 968 898</p>
          <p><Link className="font-medium text-primary-dark hover:text-primary focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary" href="/informasjonskapsler">{t('general.footer.cookies')}</Link></p>
        </div>
        <Link href="/admin/login" className="inline-flex w-fit items-center gap-2 font-semibold text-primary-dark hover:text-primary focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">{t('general.navigation.boardLogin')} <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-none stroke-current stroke-2"><path d="m9 18 6-6-6-6" /></svg></Link>
      </div>
    </footer>
  </div>;
}
