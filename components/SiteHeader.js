'use client';

import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useI18n } from '@/components/LocaleProvider';

export default function SiteHeader() {
  const { t } = useI18n('general.navigation');
  return (
    <>
      <a className="skip-link" href="#main-content">{t('skipToContent')}</a>
      <header className="site-header relative z-40 border-b border-foreground/15 bg-background text-foreground">
      <div className="mx-auto flex min-h-20 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:min-h-22 sm:px-6 lg:px-8">
        <Link href="/" aria-label={t('home')} className="block w-52 focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary sm:w-72">
          <BrandLogo variant="horizontal" decorative className="h-auto w-full" />
        </Link>
        <LanguageSwitcher />
      </div>
      </header>
    </>
  );
}
