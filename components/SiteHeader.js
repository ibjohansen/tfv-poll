import Image from 'next/image';
import Link from 'next/link';
import headerLogo from '@/public/turufjell-vel-header.png';

export default function SiteHeader() {
  return (
    <header className="relative z-40 border-b border-white/10 bg-primary text-white shadow-sm">
      <div className="mx-auto flex min-h-20 w-full max-w-7xl items-center justify-center px-4 sm:min-h-22 sm:justify-start sm:px-6 lg:px-8">
        <Link href="/" aria-label="Turufjell vel – forsiden" className="block w-56 focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:w-64">
          <Image src={headerLogo} alt="Turufjell vel" sizes="(max-width: 640px) 208px, 256px" priority className="h-auto w-full" />
        </Link>
      </div>
    </header>
  );
}
