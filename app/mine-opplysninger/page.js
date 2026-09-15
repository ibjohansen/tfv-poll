import Link from 'next/link';
import { cookies } from 'next/headers';
import SiteHeader from '@/components/SiteHeader';
import MemberSelfServiceProfile from '@/components/MemberSelfServiceProfile';
import { getMemberSelfServiceProfile } from '@/lib/member-self-service';
import { memberSessionCookieName } from '@/lib/member-self-service-utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Mine medlemsopplysninger | Turufjell Vel',
  robots: { index: false, follow: false },
};

export default async function MemberProfilePage({ searchParams }) {
  const secret = (await cookies()).get(memberSessionCookieName())?.value;
  const params = await searchParams;
  let profile = null;
  try { profile = await getMemberSelfServiceProfile(secret, params?.member); } catch { profile = null; }
  const invalid = params?.status === 'invalid';
  const emailChange = params?.emailChange;
  return <div className="member-profile-page"><SiteHeader /><main className="member-profile-main">
    <header className="member-profile-hero"><p className="eyebrow">Turufjell Vel</p><h1>Mine medlemsopplysninger</h1><p>Her kan du se opplysningene vi har knyttet til medlemskapet ditt og rette kontaktfeltene.</p></header>
    {emailChange === 'completed' && <p className="admin-success" role="status">Hoved-e-post er bekreftet og endret. Be om en ny sikker lenke for å åpne medlemsopplysningene.</p>}
    {emailChange === 'old-confirmed' && <p className="admin-success" role="status">Den gamle adressen er bekreftet. Vi har sendt en ny bekreftelseslenke til den nye adressen.</p>}
    {profile ? <MemberSelfServiceProfile key={profile.member.id} initialProfile={JSON.parse(JSON.stringify(profile))} /> : <section className="member-profile-section member-profile-empty"><h2>Tilgang kreves</h2><p>{invalid ? 'Lenken er ugyldig eller har utløpt.' : 'Be om en ny sikker lenke fra forsiden. Innloggingslenken varer i 15 minutter.'}</p><Link className="primary-button" href="/#medlemsopplysninger">Gå til forsiden</Link></section>}
  </main></div>;
}
