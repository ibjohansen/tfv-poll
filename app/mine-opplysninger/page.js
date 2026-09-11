import Link from 'next/link';
import { cookies } from 'next/headers';
import SiteHeader from '@/components/SiteHeader';
import MemberSelfServiceProfile from '@/components/MemberSelfServiceProfile';
import { getMemberSelfServiceProfile } from '@/lib/member-self-service';
import { MEMBER_SESSION_COOKIE } from '@/lib/member-self-service-utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Mine medlemsopplysninger | Turufjell vel',
  robots: { index: false, follow: false },
};

export default async function MemberProfilePage({ searchParams }) {
  const secret = (await cookies()).get(MEMBER_SESSION_COOKIE)?.value;
  let profile = null;
  try { profile = await getMemberSelfServiceProfile(secret); } catch { profile = null; }
  const invalid = (await searchParams)?.status === 'invalid';
  return <div className="member-profile-page"><SiteHeader /><main className="member-profile-main">
    <header className="member-profile-hero"><p className="eyebrow">Turufjell vel</p><h1>Mine medlemsopplysninger</h1><p>Her kan du se opplysningene vi har knyttet til medlemskapet ditt og rette kontaktfeltene.</p></header>
    {profile ? <MemberSelfServiceProfile initialProfile={JSON.parse(JSON.stringify(profile))} /> : <section className="member-profile-section member-profile-empty"><h2>Tilgang kreves</h2><p>{invalid ? 'Lenken er ugyldig eller har utløpt.' : 'Be om en ny sikker lenke fra forsiden. Lenken varer i 24 timer.'}</p><Link className="primary-button" href="/#medlemsopplysninger">Gå til forsiden</Link></section>}
  </main></div>;
}
