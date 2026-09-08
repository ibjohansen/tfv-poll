import "./globals.css";

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
    <html lang="nb">
      <body>{children}</body>
    </html>
  );
}
