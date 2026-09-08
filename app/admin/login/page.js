import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { Button } from '@material-tailwind/react';
import { auth, signIn } from '@/auth';
import { isAllowedAdmin, isAuthConfigured } from '@/lib/admin-policy';
import landscape from '@/public/turufjell.jpeg';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Logg inn | Medlemsservice',
};

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 shrink-0">
      <path fill="#f35325" d="M2 2h9.5v9.5H2z" />
      <path fill="#81bc06" d="M12.5 2H22v9.5h-9.5z" />
      <path fill="#05a6f0" d="M2 12.5h9.5V22H2z" />
      <path fill="#ffba08" d="M12.5 12.5H22V22h-9.5z" />
    </svg>
  );
}

export default async function AdminLogin({ searchParams }) {
  const configured = isAuthConfigured();
  if (configured && isAllowedAdmin((await auth())?.user)) redirect('/admin');
  const params = await searchParams;
  return (
    <main className="admin-login-page grid min-h-dvh bg-slate-50 lg:grid-cols-[minmax(0,1.05fr)_minmax(32rem,0.95fr)]">
      <section className="relative hidden min-h-dvh overflow-hidden bg-primary lg:block" aria-label="Turufjell">
        <Image
          src={landscape}
          alt="Utsikt over fjellandskapet på Turufjell"
          fill
          priority
          sizes="55vw"
          className="object-cover object-[15%_center]"
        />
        <div className="absolute inset-0 bg-linear-to-t from-slate-950/80 via-slate-950/25 to-primary/10" />
        <div className="absolute inset-x-0 bottom-0 p-12 xl:p-16">
          <div className="max-w-xl text-white">
            <p className="mb-5 text-xs font-semibold tracking-[0.2em] text-white/70 uppercase">Turufjell vel</p>
            <h2 className="text-4xl leading-tight font-semibold tracking-tight xl:text-5xl">Enklere medlemsarbeid.<br />Samlet på ett sted.</h2>
            <p className="mt-6 max-w-lg text-base leading-7 text-white/75">Administrer medlemsregister, undersøkelser og innhold i Medlemsservice.</p>
          </div>
        </div>
      </section>

      <section className="flex min-h-dvh items-center justify-center px-5 py-10 sm:px-10 lg:px-14" aria-labelledby="login-title">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-12 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-primary focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-none stroke-current stroke-2"><path d="m15 18-6-6 6-6" /></svg>
            Til forsiden
          </Link>

          <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-900/6 sm:p-10">
            <div className="mb-8 flex size-12 items-center justify-center rounded-2xl bg-primary text-sm font-bold tracking-tight text-white shadow-lg shadow-primary/20" aria-hidden="true">TV</div>
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Medlemsservice</p>
            <h1 id="login-title" className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Velkommen tilbake</h1>
            <p className="mt-4 text-[0.95rem] leading-6 text-slate-600">Logg inn med din autoriserte Microsoft 365-konto hos Turufjell vel.</p>

            {params.error && (
              <div className="mt-6 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800" role="alert">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 size-5 shrink-0 fill-none stroke-current stroke-2"><circle cx="12" cy="12" r="9" /><path d="M12 8v5m0 3h.01" /></svg>
                <p>Innloggingen ble ikke fullført. Kontroller at du bruker en konto med tilgang, og prøv igjen.</p>
              </div>
            )}

            {configured ? (
              <form className="mt-8" action={async () => {
                'use server';
                await signIn('microsoft-entra-id', { redirectTo: '/admin' });
              }}>
                <Button type="submit" color="primary" size="lg" className="flex w-full items-center justify-center gap-3 normal-case shadow-md shadow-primary/15 transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  <MicrosoftIcon />
                  Logg inn med Microsoft 365
                </Button>
              </form>
            ) : (
              <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900" role="status">Microsoft 365-innlogging er ikke konfigurert ennå. Kontakt nettstedsansvarlig.</div>
            )}

            <div className="mt-8 border-t border-slate-200 pt-6">
              <p className="flex items-start gap-3 text-xs leading-5 text-slate-500">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 size-4 shrink-0 fill-none stroke-current stroke-2"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                Tilgangen er begrenset til godkjente kontoer på turufjellvel.no.
              </p>
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-slate-400">© {new Date().getFullYear()} Turufjell vel</p>
        </div>
      </section>
    </main>
  );
}
