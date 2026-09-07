import "./globals.css";

export const metadata = {
  title: "Turufjell vel - medlemsundersøkelse",
  description: "Medlemsundersøkelse for Turufjell vel.",
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
