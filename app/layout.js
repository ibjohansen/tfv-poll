import "./globals.css";
import { Suspense } from 'react';
import { connection } from 'next/server';
import { chap } from './fonts';
import UsageTracker from '@/components/UsageTracker';
import LocaleProvider from '@/components/LocaleProvider';
import CookieNotice from '@/components/CookieNotice';
import { dictionaries, getDictionary } from '@/locales';
import { DEFAULT_LOCALE } from '@/lib/i18n/config';
import { scopedTranslator } from '@/lib/i18n/translate';

export function generateMetadata() {
  const t = scopedTranslator(getDictionary(DEFAULT_LOCALE), 'general.metadata');
  return {
    title: t('title'),
    description: t('description'),
    referrer: 'no-referrer',
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({ children }) {
  // A request nonce can only be attached to Next's framework and hydration
  // scripts during request-time rendering. Keeping this at the root prevents a
  // static child route from being served with a fresh, non-matching CSP nonce.
  await connection();
  const messages = getDictionary(DEFAULT_LOCALE);
  return (
    <html lang={DEFAULT_LOCALE} className={chap.variable} suppressHydrationWarning>
      <body><LocaleProvider locale={DEFAULT_LOCALE} messages={messages} dictionaries={dictionaries}><Suspense fallback={null}><UsageTracker /></Suspense>{children}<CookieNotice /></LocaleProvider></body>
    </html>
  );
}
