import "./globals.css";
import { chap, fragmentSerif } from './fonts';

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
      <body>{children}</body>
    </html>
  );
}
