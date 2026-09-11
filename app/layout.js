import "./globals.css";
import { chap, fragmentSerif } from './fonts';

export const metadata = {
  title: "Medlemsservice | Turufjell vel",
  description: "Medlemsservice for Turufjell vel.",
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
