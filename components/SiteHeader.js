import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';

export default function SiteHeader() {
  return (
    <header className="site-header relative z-40 border-b border-foreground/15 bg-background text-foreground">
      <div className="mx-auto flex min-h-20 w-full max-w-7xl items-center justify-center px-4 sm:min-h-22 sm:justify-start sm:px-6 lg:px-8">
        <Link href="/" aria-label="Turufjell Vel – forsiden" className="block w-60 focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary sm:w-72">
          <BrandLogo variant="horizontal" decorative priority className="h-auto w-full" />
        </Link>
      </div>
    </header>
  );
}
