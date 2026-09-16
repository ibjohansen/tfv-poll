import "./globals.css";
import { Suspense } from 'react';
import { chap, fragmentSerif } from './fonts';
import UsageTracker from '@/components/UsageTracker';
import LocaleProvider from '@/components/LocaleProvider';
import { getServerI18n } from '@/lib/i18n/server';

export async function generateMetadata() {
  const { t } = await getServerI18n('general.metadata');
  return {
    title: t('title'),
    description: t('description'),
    referrer: 'no-referrer',
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({ children }) {
  const { locale, messages } = await getServerI18n();
  return (
    <html lang={locale} className={`${chap.variable} ${fragmentSerif.variable}`}>
      <body><LocaleProvider locale={locale} messages={messages}><Suspense fallback={null}><UsageTracker /></Suspense>{children}</LocaleProvider></body>
    </html>
  );
}
