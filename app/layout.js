import "./globals.css";
import { Suspense } from 'react';
import { chap, fragmentSerif } from './fonts';
import UsageTracker from '@/components/UsageTracker';

export const metadata = {
  title: "Medlemsservice | Turufjell Vel",
  description: "Medlemsservice for Turufjell Vel.",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="nb" className={`${chap.variable} ${fragmentSerif.variable}`}>
      <body><Suspense fallback={null}><UsageTracker /></Suspense>{children}</body>
    </html>
  );
}
